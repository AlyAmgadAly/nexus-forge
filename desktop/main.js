// Electron main process. The local Node service runs in-process on 127.0.0.1
// and is stopped before the process exits. The renderer owns PeerJS because
// WebRTC lives in Chromium; this file only validates and relays peer messages.
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createNexusService } from '../server/service.js';
import { prepareUserData } from '../server/data-migration.js';
import { APP_VERSION, MAX_PEER_MESSAGE_BYTES } from '../shared/protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const isDev = !app.isPackaged;
const SESSION_RE = /^[A-Za-z0-9_-]{8,100}$/;

app.setName('Nexus Forge');
if (process.platform === 'win32') app.setAppUserModelId('com.nexusforge.game');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let service = null;
  let win = null;
  let shutdownStarted = false;

  const seedDir = process.env.NEXUS_SEED_DIR
    ? path.resolve(process.env.NEXUS_SEED_DIR)
    : (app.isPackaged ? path.join(process.resourcesPath, 'seed') : path.join(ROOT, 'data'));
  const dataDir = process.env.NEXUS_DATA_DIR
    ? path.resolve(process.env.NEXUS_DATA_DIR)
    : path.join(app.getPath('userData'), 'data');
  const legacyDir = isDev ? path.join(ROOT, 'data') : null;

  function trustedSender(event) {
    if (!service?.url) return false;
    const frame = event.senderFrame;
    if (!frame || frame.parent) return false;
    try {
      return new URL(frame.url).origin === new URL(service.url).origin;
    } catch {
      return false;
    }
  }

  function registerIpc() {
    ipcMain.handle('nexus:get-config', (event) => {
      if (!trustedSender(event)) throw new Error('Untrusted request.');
      return {
        desktop: true,
        url: service.url,
        appVersion: APP_VERSION,
        platform: process.platform,
        dataDir,
        packaged: app.isPackaged,
      };
    });

    ipcMain.handle('nexus:get-admin-token', (event) => {
      if (!trustedSender(event)) throw new Error('Untrusted request.');
      return service.store.adminToken;
    });

    ipcMain.handle('nexus:peer-open', (event, payload) => {
      if (!trustedSender(event)) throw new Error('Untrusted request.');
      const sessionId = String(payload?.sessionId || '');
      const remotePeerId = String(payload?.remotePeerId || '');
      if (!SESSION_RE.test(sessionId) || remotePeerId.length > 160) {
        return { ok: false, error: 'Invalid peer session.' };
      }
      return service.openPeer({ sessionId, remotePeerId });
    });

    ipcMain.handle('nexus:peer-message', (event, payload) => {
      if (!trustedSender(event)) throw new Error('Untrusted request.');
      const sessionId = String(payload?.sessionId || '');
      const data = payload?.data;
      if (!SESSION_RE.test(sessionId) || typeof data !== 'string') {
        return { ok: false, error: 'Invalid peer message.' };
      }
      if (Buffer.byteLength(data, 'utf8') > MAX_PEER_MESSAGE_BYTES) {
        return { ok: false, error: 'Peer message is too large.' };
      }
      return service.messagePeer(sessionId, data);
    });

    ipcMain.handle('nexus:peer-close', (event, sessionId) => {
      if (!trustedSender(event)) throw new Error('Untrusted request.');
      const id = String(sessionId || '');
      if (!SESSION_RE.test(id)) return { ok: false, error: 'Invalid peer session.' };
      return service.closePeer(id);
    });
  }

  function hardenSession() {
    // The app only needs clipboard writes for room-code copy buttons. Every
    // other permission stays denied, and requests must come from our window.
    const allowed = new Set(['clipboard-sanitized-write']);
    const isAppWindow = (webContents) => !!win && !win.isDestroyed() && webContents === win.webContents;
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(isAppWindow(webContents) && allowed.has(permission));
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      return isAppWindow(webContents) && allowed.has(permission);
    });
  }

  function createWindow() {
    win = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 980,
      minHeight: 680,
      show: false,
      backgroundColor: '#070b15',
      autoHideMenuBar: true,
      title: 'Nexus Forge',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        sandbox: true,
        webSecurity: true,
        spellcheck: false,
      },
    });
    win.setMenuBarVisibility(false);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => {
      try {
        if (new URL(url).origin !== new URL(service.url).origin) event.preventDefault();
      } catch {
        event.preventDefault();
      }
    });
    win.webContents.on('will-attach-webview', (event) => event.preventDefault());
    win.webContents.on('will-redirect', (event, url) => {
      try {
        if (new URL(url).origin !== new URL(service.url).origin) event.preventDefault();
      } catch {
        event.preventDefault();
      }
    });
    win.once('ready-to-show', () => win?.show());
    win.on('closed', () => { win = null; });
    win.loadURL(service.url).catch((err) => {
      dialog.showErrorBox('Nexus Forge could not open', err?.message || String(err));
      app.quit();
    });
  }

  async function boot() {
    try {
      await prepareUserData({ seedDir, dataDir, legacyDir, logger: console.log });
      service = await createNexusService({
        dataDir,
        seedDir,
        desktop: true,
        host: '127.0.0.1',
        port: 0,
        logger: console,
      });
      service.peerHub.setRendererSend((channel, payload) => {
        if (win && !win.isDestroyed()) win.webContents.send('nexus:peer-event', { channel, ...payload });
      });
      await service.start();
      hardenSession();
      registerIpc();
      createWindow();
    } catch (err) {
      dialog.showErrorBox('Nexus Forge could not start', err?.stack || err?.message || String(err));
      app.quit();
    }
  }

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.whenReady().then(boot);
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (!service || shutdownStarted) return;
    event.preventDefault();
    shutdownStarted = true;
    service.stop()
      .catch((err) => console.error('Service shutdown failed:', err))
      .finally(() => {
        service = null;
        app.quit();
      });
  });

  // A packaged app should never be able to open a second window or external URL
  // through renderer-created shell calls.
  app.on('web-contents-created', (event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}
