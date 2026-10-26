// Renderer-side PeerJS transport. The host owns one namespaced registration per
// room; guests connect directly to that registration. All payloads are bounded
// JSON strings validated again by the Node service.
import {
  PEER_ID_PREFIX, MAX_PEER_MESSAGE_BYTES, PROTOCOL_VERSION,
} from '/shared/protocol.js';

const DEFAULT_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function peerOptions({ iceServers = [], debug = 0 } = {}) {
  return {
    debug,
    config: {
      iceServers: [...DEFAULT_ICE, ...(Array.isArray(iceServers) ? iceServers : [])],
    },
  };
}

export function roomPeerId(code) {
  return `${PEER_ID_PREFIX}${String(code || '').trim().toUpperCase()}`;
}

function sessionId() {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `peer-${id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function transportError(type, message, extra = {}) {
  const err = new Error(message || type || 'Peer connection failed.');
  err.code = type || 'PEER_ERROR';
  Object.assign(err, extra);
  return err;
}

function messageSize(value) {
  try { return new Blob([value]).size; } catch { return String(value).length; }
}

function mapPeerError(err) {
  const type = err?.type || err?.code || 'PEER_ERROR';
  const messages = {
    'unavailable-id': 'That room code is already registered. Generating a new code…',
    'peer-unavailable': 'Room not found. Check the code and ask the host to keep their game open.',
    'server-error': 'The public signaling service is unavailable. Try again in a moment.',
    'network': 'The signaling connection was interrupted.',
    'socket-error': 'The signaling connection failed.',
    'socket-closed': 'The signaling connection closed.',
    'browser-incompatible': 'This browser does not support WebRTC data connections.',
    'invalid-id': 'The room code cannot be used as a peer address.',
  };
  return transportError(type, messages[type] || err?.message || 'Peer connection failed.');
}

export class HostTransport {
  constructor({ bridge, onStatus, onData, onPeerOpen, onPeerClose, onError, iceServers = [] } = {}) {
    this.bridge = bridge;
    this.onStatus = onStatus || (() => {});
    this.onData = onData || (() => {});
    this.onPeerOpen = onPeerOpen || (() => {});
    this.onPeerClose = onPeerClose || (() => {});
    this.onError = onError || (() => {});
    this.options = peerOptions({ iceServers });
    this.peer = null;
    this.code = null;
    this.sessions = new Map();
    this.intentional = false;
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this._bridgeOff = null;
  }

  _attachBridge() {
    if (this._bridgeOff || !this.bridge) return;
    this._bridgeOff = this.bridge.onEvent((event) => {
      if (!event || typeof event !== 'object') return;
      if (event.channel === 'nexus:peer-send') {
        const entry = this.sessions.get(event.sessionId);
        if (!entry || entry.closed) return;
        const data = String(event.data);
        if (entry.conn.open) {
          try { entry.conn.send(data); } catch { this._dropSession(event.sessionId); }
          return;
        }
        // The main process can answer before the browser reports the data
        // channel open (notably the handshake). Buffer a bounded amount rather
        // than dropping the host's first message.
        if (entry.outbox.length >= 32 || entry.outboxBytes + data.length > MAX_PEER_MESSAGE_BYTES * 2) {
          this._closeConnection(entry, { notifyMain: true, reason: 'outbound buffer overflow' });
          return;
        }
        entry.outbox.push(data);
        entry.outboxBytes += data.length;
        return;
      }
      if (event.channel === 'nexus:peer-close') {
        const entry = this.sessions.get(event.sessionId);
        if (entry) this._closeConnection(entry, { notifyMain: false });
      }
    });
  }

  async start(code) {
    if (!this.bridge) throw transportError('NO_BRIDGE', 'Internet hosting requires the desktop app.');
    if (!globalThis.Peer) throw transportError('NO_PEERJS', 'PeerJS did not load.');
    this.destroy({ notify: false });
    this.intentional = false;
    this.code = String(code || '').trim().toUpperCase();
    this._attachBridge();
    const id = roomPeerId(this.code);
    this.onStatus('registering', { code: this.code, peerId: id });
    await this._register(id, true);
    return this.code;
  }

  _register(id, first = false) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const peer = new globalThis.Peer(id, this.options);
      this.peer = peer;
      const fail = (err) => {
        const mapped = mapPeerError(err);
        if (!settled) {
          settled = true;
          try { peer.destroy(); } catch {}
          reject(mapped);
        } else if (!this.intentional) {
          this.onError(mapped);
        }
      };
      peer.on('open', () => {
        if (this.intentional || this.peer !== peer) return;
        this.reconnectAttempts = 0;
        if (!settled) {
          settled = true;
          this.onStatus('hosting', { code: this.code, peerId: id });
          resolve(id);
        } else {
          this.onStatus('hosting', { code: this.code, peerId: id, recovered: true });
        }
      });
      peer.on('connection', (conn) => this._accept(conn));
      peer.on('error', fail);
      peer.on('disconnected', () => {
        if (this.intentional || this.peer !== peer) return;
        this.onStatus('signaling-lost', { code: this.code });
        this._retrySignaling();
      });
      peer.on('close', () => {
        if (this.intentional || this.peer !== peer) return;
        this.onStatus('signaling-closed', { code: this.code });
        if (settled) this._retrySignaling();
      });
      if (first) setTimeout(() => {
        if (!settled && !this.intentional) {
          settled = true;
          try { peer.destroy(); } catch {}
          reject(transportError('REGISTER_TIMEOUT', 'Registering the room timed out. Check your internet connection.'));
        }
      }, 15000);
    });
  }

  async _retrySignaling() {
    if (this.reconnecting || this.intentional || !this.code) return;
    this.reconnecting = true;
    while (!this.intentional && this.reconnectAttempts < 5) {
      const delay = Math.min(10000, 1000 * (2 ** this.reconnectAttempts));
      this.reconnectAttempts += 1;
      await wait(delay);
      if (this.intentional || !this.peer) break;
      if (this.peer.open) break;
      try {
        if (this.peer.disconnected && !this.peer.destroyed) {
          this.peer.reconnect();
        } else {
          // A fresh Peer cannot claim the same id while the old registration is
          // still alive. Drop the dead object before asking the signaling
          // service for the room address again.
          if (this.peer && !this.peer.destroyed) {
            try { this.peer.destroy(); } catch {}
          }
          this.peer = null;
          const id = roomPeerId(this.code);
          await this._register(id, false);
        }
      } catch (err) {
        if (err.code === 'unavailable-id') {
          // The old registration may still be releasing; keep the error visible
          // and let the host UI request a fresh room code if it persists.
          this.onError(err);
          break;
        }
        this.onError(err);
      }
    }
    this.reconnecting = false;
    if (!this.intentional && this.reconnectAttempts >= 5 && !this.peer?.open) {
      this.onStatus('signaling-failed', { code: this.code });
    }
  }

  _accept(conn) {
    if (this.intentional || this.sessions.size >= 16) {
      try { conn.close(); } catch {}
      return;
    }
    const id = sessionId();
    const entry = {
      sessionId: id,
      conn,
      open: false,
      openedAt: Date.now(),
      mainReady: false,
      queue: [],
      outbox: [],
      outboxBytes: 0,
      closed: false,
    };
    this.sessions.set(id, entry);
    const ready = async () => {
      const result = await this.bridge.open({ sessionId: id, remotePeerId: conn.peer }).catch((err) => ({ ok: false, error: err?.message }));
      if (entry.closed) {
        // The data channel may have closed while the main process was creating
        // its session. Close the orphaned session instead of leaking it.
        this.bridge.close(id).catch(() => {});
        return;
      }
      if (!result?.ok) {
        this._closeConnection(entry, { notifyMain: false });
        return;
      }
      entry.mainReady = true;
      for (const data of entry.queue.splice(0)) {
        this.bridge.message(id, data).catch(() => {});
      }
      try { this.onPeerOpen({ sessionId: id, remotePeerId: conn.peer }); } catch {}
    };
    ready();
    conn.on('open', () => {
      entry.open = true;
      for (const data of entry.outbox.splice(0)) {
        try { entry.conn.send(data); } catch { this._dropSession(id, { notifyMain: true }); break; }
      }
      entry.outboxBytes = 0;
      this.onStatus('hosting', { code: this.code, guests: this._openCount() });
    });
    conn.on('data', (data) => {
      if (typeof data !== 'string' || !data) return;
      if (messageSize(data) > MAX_PEER_MESSAGE_BYTES) {
        this._closeConnection(entry, { notifyMain: true, reason: 'message too large' });
        return;
      }
      if (!entry.mainReady) {
        if (entry.queue.length >= 24 || entry.queue.reduce((n, item) => n + item.length, 0) + data.length > MAX_PEER_MESSAGE_BYTES * 2) {
          this._closeConnection(entry, { notifyMain: true, reason: 'handshake buffer overflow' });
          return;
        }
        entry.queue.push(data);
        return;
      }
      this.bridge.message(id, data).catch(() => {});
      this.onData({ sessionId: id, data });
    });
    conn.on('close', () => this._dropSession(id, { notifyMain: true }));
    conn.on('error', () => this._dropSession(id, { notifyMain: true }));
    setTimeout(() => {
      if (!entry.open && !entry.closed) this._closeConnection(entry, { notifyMain: true, reason: 'connection timeout' });
    }, 20000);
  }

  _openCount() {
    return [...this.sessions.values()].filter((entry) => entry.open && !entry.closed).length;
  }

  _dropSession(id, { notifyMain = true } = {}) {
    const entry = this.sessions.get(id);
    if (!entry) return;
    this.sessions.delete(id);
    entry.closed = true;
    try { entry.conn.close(); } catch {}
    entry.outbox = [];
    entry.outboxBytes = 0;
    entry.queue = [];
    if (entry.mainReady && notifyMain) this.bridge.close(id).catch(() => {});
    try { this.onPeerClose({ sessionId: id }); } catch {}
    this.onStatus('hosting', { code: this.code, guests: this._openCount() });
  }

  _closeConnection(entry, { notifyMain = true, reason = 'closed' } = {}) {
    if (!entry || entry.closed) return;
    entry.closed = true;
    this.sessions.delete(entry.sessionId);
    try { entry.conn.close(); } catch {}
    entry.outbox = [];
    entry.outboxBytes = 0;
    entry.queue = [];
    if (notifyMain && entry.mainReady) this.bridge.close(entry.sessionId).catch(() => {});
    try { this.onPeerClose({ sessionId: entry.sessionId, reason }); } catch {}
  }

  send(sessionId, data) {
    const entry = this.sessions.get(sessionId);
    if (!entry || !entry.open) return false;
    try { entry.conn.send(data); return true; } catch { return false; }
  }

  destroy({ notify = true } = {}) {
    this.intentional = true;
    if (notify) {
      for (const entry of [...this.sessions.values()]) this._closeConnection(entry, { notifyMain: true, reason: 'host closed' });
    } else {
      for (const entry of [...this.sessions.values()]) {
        entry.closed = true;
        try { entry.conn.close(); } catch {}
      }
      this.sessions.clear();
    }
    try { this.peer?.destroy(); } catch {}
    this.peer = null;
    this.reconnecting = false;
    if (this._bridgeOff) this._bridgeOff();
    this._bridgeOff = null;
  }

  get connectedPeerCount() { return this._openCount(); }
}

export class GuestTransport {
  constructor({ onStatus, onData, onClose, onError, iceServers = [] } = {}) {
    this.onStatus = onStatus || (() => {});
    this.onData = onData || (() => {});
    this.onClose = onClose || (() => {});
    this.onError = onError || (() => {});
    this.options = peerOptions({ iceServers });
    this.peer = null;
    this.conn = null;
    this.code = null;
    this.intentional = false;
    this.connected = false;
    this._closedNotified = false;
  }

  async connect(code, { timeout = 14000 } = {}) {
    this.destroy();
    this.intentional = false;
    this._closedNotified = false;
    this.code = String(code || '').trim().toUpperCase();
    if (!this.code) throw transportError('INVALID_CODE', 'Enter a room code.');
    if (!globalThis.Peer) throw transportError('NO_PEERJS', 'PeerJS did not load.');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw transportError('OFFLINE', 'You are offline. Reconnect to the internet and try again.');
    }
    this.onStatus('registering', { code: this.code });
    const peer = new globalThis.Peer(undefined, this.options);
    this.peer = peer;
    await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { peer.destroy(); } catch {}
        reject(transportError('SIGNALING_TIMEOUT', 'Could not reach the signaling service. Check your internet connection.'));
      }, timeout);
      const cleanup = () => clearTimeout(timer);
      peer.on('open', () => { if (!settled) { settled = true; cleanup(); resolve(); } });
      peer.on('error', (err) => {
        const mapped = mapPeerError(err);
        if (!settled) { settled = true; cleanup(); try { peer.destroy(); } catch {} reject(mapped); }
        else if (['network', 'socket-error', 'server-error', 'socket-closed'].includes(err?.type) && this.connected) {
          this.onStatus('signaling-lost', { code: this.code });
        } else if (!this.intentional) {
          this.onError(mapped);
        }
      });
      peer.on('disconnected', () => {
        if (this.intentional || this.peer !== peer) return;
        this.onStatus('signaling-lost', { code: this.code });
        if (this.connected) setTimeout(() => { try { peer.reconnect(); } catch {} }, 1000);
      });
      peer.on('close', () => {
        if (this.intentional || this.peer !== peer) return;
        if (this.connected) this._notifyClosed('signaling closed');
      });
    });

    this.onStatus('connecting', { code: this.code });
    const conn = peer.connect(roomPeerId(this.code), { reliable: true, metadata: { protocol: PROTOCOL_VERSION } });
    this.conn = conn;
    await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { conn.close(); } catch {}
        reject(transportError('CONNECT_TIMEOUT', 'The host did not answer. Check the code and that the host is still online.'));
      }, timeout);
      conn.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.connected = true;
        this.onStatus('connected', { code: this.code });
        resolve();
      });
      peer.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { conn.close(); } catch {}
        reject(mapPeerError(err));
      });
      conn.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(mapPeerError(err));
      });
    });

    conn.on('data', (data) => {
      if (typeof data !== 'string' || !data) return;
      if (messageSize(data) > MAX_PEER_MESSAGE_BYTES) {
        this.onError(transportError('MESSAGE_TOO_LARGE', 'The host sent an oversized message.'));
        return;
      }
      this.onData(data);
    });
    conn.on('close', () => {
      this.connected = false;
      if (!this.intentional) this._notifyClosed('data channel closed');
    });
    conn.on('error', () => {
      this.connected = false;
      if (!this.intentional) this._notifyClosed('data channel error');
    });
    return this;
  }

  _notifyClosed(reason) {
    if (this._closedNotified) return;
    this._closedNotified = true;
    this.onStatus('closed', { code: this.code, reason });
    try { this.onClose({ code: this.code, reason }); } catch {}
  }

  send(data) {
    if (!this.conn?.open) return false;
    try { this.conn.send(data); return true; } catch { return false; }
  }

  destroy() {
    this.intentional = true;
    this.connected = false;
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.conn = null;
    this.peer = null;
  }
}
