// Host-side bridge between PeerJS data channels (owned by the Electron renderer)
// and the authoritative RoomManager. Guests never supply their own identity.
import {
  APP_VERSION, MAX_PEER_MESSAGE_BYTES, PEER_HANDSHAKE_TIMEOUT_MS, PROTOCOL_VERSION,
} from '../shared/protocol.js';
import { compareManifests } from '../shared/manifest.js';
import { dispatchClientMessage } from './dispatch.js';

const SESSION_RE = /^[A-Za-z0-9_-]{8,100}$/;
const CODE_RE = /^[A-Z2-9]{5}$/;

class PeerConnection {
  constructor(hub, sessionId, remotePeerId) {
    this.hub = hub;
    this.sessionId = sessionId;
    this.remotePeerId = String(remotePeerId || '').slice(0, 120);
    this.kind = 'peer';
    this.clientId = null;
    this.roomCode = null;
    this.readyState = 1;
    this.helloDone = false;
    this.peerMeta = {};
    this.connectedAt = Date.now();
    this.lastSeen = Date.now();
    this.rateWindow = Date.now();
    this.rateCount = 0;
    this.handshakeTimer = setTimeout(() => {
      if (this.helloDone || this.readyState !== 1) return;
      this.send({ type: 'peerError', code: 'HANDSHAKE_TIMEOUT', message: 'The peer handshake timed out.' });
      this.close(4010, 'handshake timeout');
    }, PEER_HANDSHAKE_TIMEOUT_MS);
    this.handshakeTimer.unref?.();
  }

  send(message) {
    if (this.readyState !== 1) return;
    let data;
    if (typeof message === 'string') {
      data = message;
    } else {
      try { data = JSON.stringify(message); } catch { return; }
    }
    if (Buffer.byteLength(data) > MAX_PEER_MESSAGE_BYTES) return;
    this.hub.sendToRenderer('nexus:peer-send', { sessionId: this.sessionId, data });
  }

  close(code = 4000, reason = 'closed') {
    if (this.readyState === 3) return;
    this.readyState = 3;
    clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
    this.hub.sendToRenderer('nexus:peer-close', { sessionId: this.sessionId, code, reason });
    this.hub.sessions.delete(this.sessionId);
  }

  allowMessage() {
    const now = Date.now();
    if (now - this.rateWindow > 10000) {
      this.rateWindow = now;
      this.rateCount = 0;
    }
    this.rateCount++;
    return this.rateCount <= 150;
  }
}

export class PeerHub {
  constructor({ store, rooms }) {
    this.store = store;
    this.rooms = rooms;
    this.sessions = new Map();
    this.sendToRenderer = () => {};
  }

  setRendererSend(fn) {
    this.sendToRenderer = typeof fn === 'function' ? fn : () => {};
  }

  open({ sessionId, remotePeerId } = {}) {
    if (!SESSION_RE.test(String(sessionId || ''))) return { ok: false, error: 'Invalid peer session.' };
    if (this.sessions.has(sessionId)) return { ok: false, error: 'Duplicate peer session.' };
    const conn = new PeerConnection(this, sessionId, remotePeerId);
    this.sessions.set(sessionId, conn);
    return { ok: true };
  }

  message(sessionId, raw) {
    const conn = this.sessions.get(sessionId);
    if (!conn || conn.readyState !== 1) return { ok: false, error: 'Unknown peer session.' };
    if (typeof raw !== 'string') {
      conn.send({ type: 'error', message: 'Only JSON text messages are accepted.' });
      return { ok: false };
    }
    if (Buffer.byteLength(raw) > MAX_PEER_MESSAGE_BYTES) {
      conn.send({ type: 'error', message: 'Message is too large.' });
      conn.close(4009, 'message too large');
      return { ok: false };
    }
    if (!conn.allowMessage()) {
      conn.send({ type: 'error', message: 'Too many messages; wait a moment.' });
      conn.close(4029, 'rate limited');
      return { ok: false };
    }
    let msg;
    try { msg = JSON.parse(raw); } catch {
      conn.send({ type: 'error', message: 'Invalid message.' });
      return { ok: false };
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
      conn.send({ type: 'error', message: 'Invalid message.' });
      return { ok: false };
    }
    conn.lastSeen = Date.now();
    if (msg.type === 'peerHello') return this.hello(conn, msg);
    if (!conn.helloDone) {
      conn.send({ type: 'error', message: 'Complete the peer handshake first.' });
      return { ok: false };
    }
    return dispatchClientMessage({ conn, msg, rooms: this.rooms, transport: 'peer' });
  }

  hello(conn, msg) {
    if (conn.helloDone) {
      conn.send({ type: 'error', message: 'Peer handshake was already completed.' });
      return { ok: false };
    }
    clearTimeout(conn.handshakeTimer);
    conn.handshakeTimer = null;
    if (Number(msg.protocol) !== PROTOCOL_VERSION) {
      conn.send({
        type: 'peerError',
        code: 'PROTOCOL_MISMATCH',
        message: `Host uses protocol ${PROTOCOL_VERSION}; this client sent ${msg.protocol ?? 'none'}.`,
      });
      conn.close(4002, 'protocol mismatch');
      return { ok: false };
    }
    const code = String(msg.code || '').trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      conn.send({ type: 'peerError', code: 'INVALID_CODE', message: 'That room code is not valid.' });
      conn.close(4003, 'invalid code');
      return { ok: false };
    }
    const room = this.rooms.rooms.get(code);
    if (!room) {
      conn.send({ type: 'peerError', code: 'ROOM_NOT_FOUND', message: 'Room not found. Check the code and whether the host is still online.' });
      conn.close(4004, 'room not found');
      return { ok: false };
    }
    conn.peerMeta = {
      appVersion: String(msg.appVersion || '').slice(0, 40),
      manifest: msg.manifest && typeof msg.manifest === 'object' ? msg.manifest : null,
    };
    const manifest = this.rooms.manifestFor(room);
    const compatibility = compareManifests(msg.manifest, manifest);
    if (!compatibility.ok) {
      conn.send({
        type: 'peerError',
        code: 'CONTENT_MISMATCH',
        message: compatibility.errors.join(' '),
        errors: compatibility.errors,
      });
      conn.close(4008, 'content mismatch');
      return { ok: false };
    }

    if (msg.resumeToken) {
      const resumed = this.rooms.resumePeer(conn, room, String(msg.resumeToken || ''));
      if (!resumed) {
        conn.send({ type: 'peerError', code: 'RESUME_FAILED', message: 'That reconnect session expired. Ask the host for the room code and join again.' });
        conn.close(4005, 'resume failed');
        return { ok: false };
      }
      conn.helloDone = true;
      conn.clientId = resumed.clientId;
      conn.roomCode = room.code;
      conn.send({
        type: 'peerWelcome',
        protocol: PROTOCOL_VERSION,
        clientId: resumed.clientId,
        appVersion: APP_VERSION,
        hostName: this.store.settings?.gameName || 'Nexus Forge',
        manifest,
        resume: true,
        warnings: compatibility.warnings,
      });
      this.rooms.sendResume(room, resumed);
      return { ok: true, resumed: true };
    }

    conn.clientId = `peer-${conn.sessionId}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
    conn.helloDone = true;
    this.rooms.attach(conn, conn.clientId);
    conn.send({
      type: 'peerWelcome',
      protocol: PROTOCOL_VERSION,
      clientId: conn.clientId,
      appVersion: APP_VERSION,
      hostName: this.store.settings?.gameName || 'Nexus Forge',
      manifest,
      resume: false,
      warnings: compatibility.warnings,
    });
    return { ok: true, resumed: false };
  }

  close(sessionId) {
    const conn = this.sessions.get(sessionId);
    if (!conn) return { ok: true };
    clearTimeout(conn.handshakeTimer);
    conn.handshakeTimer = null;
    if (conn.helloDone) this.rooms.detach(conn);
    conn.readyState = 3;
    this.sessions.delete(sessionId);
    return { ok: true };
  }

  closeAll() {
    for (const sessionId of [...this.sessions.keys()]) this.close(sessionId);
  }

  broadcast(message) {
    for (const conn of this.sessions.values()) {
      if (conn.helloDone) conn.send(message);
    }
  }

  dispose() {
    this.closeAll();
    this.sendToRenderer = () => {};
  }
}
