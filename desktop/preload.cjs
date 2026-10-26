// Narrow, validated bridge. No Node APIs, filesystem paths, or generic IPC are
// exposed to the page. Every call is revalidated in the main process.
const { contextBridge, ipcRenderer } = require('electron');

const peerEventListeners = new Set();

ipcRenderer.on('nexus:peer-event', (_event, payload) => {
  if (!payload || typeof payload !== 'object') return;
  for (const listener of peerEventListeners) {
    try { listener(payload); } catch { /* the page owns its listener errors */ }
  }
});

contextBridge.exposeInMainWorld('nexusDesktop', Object.freeze({
  isDesktop: true,
  getConfig: () => ipcRenderer.invoke('nexus:get-config'),
  getAdminToken: () => ipcRenderer.invoke('nexus:get-admin-token'),
  peer: Object.freeze({
    open: (payload) => ipcRenderer.invoke('nexus:peer-open', {
      sessionId: String(payload?.sessionId || ''),
      remotePeerId: String(payload?.remotePeerId || ''),
    }),
    message: (sessionId, data) => ipcRenderer.invoke('nexus:peer-message', {
      sessionId: String(sessionId || ''),
      data: typeof data === 'string' ? data : '',
    }),
    close: (sessionId) => ipcRenderer.invoke('nexus:peer-close', String(sessionId || '')),
    onEvent: (listener) => {
      if (typeof listener !== 'function') return () => {};
      peerEventListeners.add(listener);
      return () => peerEventListeners.delete(listener);
    },
  }),
}));
