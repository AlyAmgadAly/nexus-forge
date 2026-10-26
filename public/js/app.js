import { apiGet, apiPost, getAdminToken, setAdminToken } from './api.js';
import { setCardIndex, initTooltips, toast, openModal, closeModal, modalPrompt, modalConfirm, copyText, esc } from './ui.js';
import { renderHome } from './views/home.js';
import { renderDeckBuilder } from './views/deckbuilder.js';
import { renderDeckSelection } from './views/deckselection.js';
import { renderLobby } from './views/lobby.js';
import { renderGame } from './views/game.js';
import { renderAdmin } from './views/admin.js';
import { HostTransport, GuestTransport } from './net/peer.js';
import { MUTATING_MESSAGE_TYPES } from '/shared/protocol.js';
import { compareManifests } from '/shared/manifest.js';

const CLIENT_KEY = 'nf.clientId';
const NAME_KEY = 'nf.playerName';
const ROOM_KEY = 'nf.roomCode';
const NET_ROLE_KEY = 'nf.netRole';
const NET_TOKEN_KEY = 'nf.netToken';
const MAX_RECONNECT_ATTEMPTS = 4;

const savedNetRole = sessionStorage.getItem(NET_ROLE_KEY) || null;
const savedResumeToken = sessionStorage.getItem(NET_TOKEN_KEY) || '';

export const state = {
  meta: null,
  pool: [],
  decks: [],
  playerName: localStorage.getItem(NAME_KEY) || '',
  clientId: localStorage.getItem(CLIENT_KEY) || '',
  connected: false,
  connecting: false,
  ws: null,
  reconnectTimer: null,
  reconnectDelay: 1000,
  welcome: null,
  roomCode: localStorage.getItem(ROOM_KEY) || null,
  lobby: null,
  game: null,
  gameRoom: null,
  spectator: false,
  pendingJoin: '',
  pendingRoomDeckId: null,
  deckEditId: null,
  route: '',
  bootError: '',
  libraryVersion: 0,
  desktop: !!window.nexusDesktop?.isDesktop,
  desktopConfig: null,
  basePool: null,
  remotePoolIds: new Set(),
  roomManifest: null,
  roomCatalogVersion: 0,
  lastLobbyRevision: -1,
  lastGameRevision: -1,
  hostTransport: null,
  guestTransport: null,
  hostRegistering: false,
  codeWait: null,
  pendingHello: null,
  roomJoinWaiter: null,
  netReconnectTimer: null,
  net: {
    role: savedNetRole,
    status: savedNetRole ? 'reconnecting' : 'idle',
    code: localStorage.getItem(ROOM_KEY) || null,
    resumeToken: savedResumeToken,
    guest: null,
    retries: 0,
    error: '',
    signalingLost: false,
    hostGuests: 0,
    deckId: 'auto',
    contentOfferPending: false,
    contentRequestFor: '',
  },
};

export function navigate(path) {
  const hash = path.startsWith('#') ? path : `#${path}`;
  if (location.hash === hash) {
    renderApp();
    return;
  }
  location.hash = hash;
}

function commandId() {
  return (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
}

function wsSend(type, payload = {}) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    toast('The local desktop service is not connected yet.', 'error');
    return false;
  }
  try {
    state.ws.send(JSON.stringify({ type, ...payload }));
    return true;
  } catch {
    toast('Could not send that action.', 'error');
    return false;
  }
}

function peerSend(type, payload = {}, transport = state.guestTransport) {
  if (!transport?.connected) return false;
  const message = { type, ...payload };
  if (MUTATING_MESSAGE_TYPES.has(type) && !message.commandId) message.commandId = commandId();
  try {
    return transport.send(JSON.stringify(message));
  } catch {
    return false;
  }
}

export function send(type, payload = {}) {
  if (state.desktop && state.net.role === 'guest') {
    if (!peerSend(type, payload)) {
      toast('The connection to the host is not ready. Reconnect before acting.', 'error');
      return false;
    }
    return true;
  }
  const message = { type, ...payload };
  if (MUTATING_MESSAGE_TYPES.has(type) && !message.commandId) message.commandId = commandId();
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    toast('Not connected to the desktop service yet.', 'error');
    return false;
  }
  try {
    state.ws.send(JSON.stringify(message));
    return true;
  } catch {
    toast('Could not send that action.', 'error');
    return false;
  }
}

export async function refreshDecks() {
  const data = await apiGet('/api/decks');
  state.decks = data.decks || [];
  state.libraryVersion++;
  return state.decks;
}

export async function refreshPool() {
  const data = await apiGet('/api/cardpool');
  state.pool = data.cards || [];
  setCardIndex(state.pool);
  state.libraryVersion++;
  return state.pool;
}

export async function refreshMeta() {
  state.meta = await apiGet('/api/meta');
  return state.meta;
}

async function ensureName() {
  if (state.playerName) return state.playerName;
  const name = await modalPrompt('What should we call you?', {
    label: 'Display name',
    placeholder: 'Summoner name',
    confirmLabel: 'Enter the Forge',
  });
  const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 22);
  if (!clean) return '';
  state.playerName = clean;
  localStorage.setItem(NAME_KEY, clean);
  return clean;
}

export async function createRoom(deckId = null) {
  const name = await ensureName();
  if (!name) return false;
  state.pendingRoomDeckId = deckId;
  if (state.desktop) {
    setNet({ role: 'host', status: 'creating', error: '', signalingLost: false, retries: 0 });
    sessionStorage.setItem(NET_ROLE_KEY, 'host');
  }
  const sent = send('create', { name });
  if (!sent) state.pendingRoomDeckId = null;
  return sent;
}

function netStatusInfo() {
  const net = state.net;
  if (!state.desktop) return { label: 'Local server', tone: state.connected ? 'on' : 'off' };
  if (!net.role) return { label: 'Internet idle', tone: 'off' };
  if (net.role === 'host') {
    if (net.status === 'creating' || net.status === 'registering') return { label: 'Registering room…', tone: 'warn' };
    if (net.status === 'failed') return { label: 'Room failed', tone: 'off' };
    if (net.signalingLost) return { label: 'Hosting · signaling issue', tone: 'warn' };
    return { label: `Hosting${net.hostGuests ? ` · ${net.hostGuests} online` : ''}`, tone: 'on' };
  }
  if (net.status === 'joining') return { label: 'Connecting to host…', tone: 'warn' };
  if (net.status === 'reconnecting') return { label: `Reconnecting ${Math.min(net.retries || 1, MAX_RECONNECT_ATTEMPTS)}/${MAX_RECONNECT_ATTEMPTS}…`, tone: 'warn' };
  if (net.status === 'failed') return { label: 'Connection failed', tone: 'off' };
  if (net.status === 'leaving') return { label: 'Leaving…', tone: 'warn' };
  if (net.signalingLost) return { label: 'Connected · signaling issue', tone: 'warn' };
  return { label: 'Connected to host', tone: 'on' };
}

function paintNetStatus() {
  const info = netStatusInfo();
  document.querySelectorAll('[data-net-status]').forEach((el) => {
    el.textContent = info.label;
    el.dataset.netTone = info.tone;
    el.classList.toggle('net-on', info.tone === 'on');
    el.classList.toggle('net-warn', info.tone === 'warn');
    el.classList.toggle('net-off', info.tone === 'off');
    if (state.net.error) el.title = state.net.error;
  });
}

function setNet(patch = {}, { render = true } = {}) {
  const before = `${state.net.role}|${state.net.status}|${state.net.error}|${state.net.signalingLost}|${state.net.retries}`;
  if (typeof patch === 'string') patch = { status: patch };
  Object.assign(state.net, patch);
  paintNetStatus();
  const after = `${state.net.role}|${state.net.status}|${state.net.error}|${state.net.signalingLost}|${state.net.retries}`;
  if (render && before !== after && state.meta && state.pool.length) renderApp();
}

function saveGuestSession() {
  sessionStorage.setItem(NET_ROLE_KEY, 'guest');
  if (state.net.resumeToken) sessionStorage.setItem(NET_TOKEN_KEY, state.net.resumeToken);
}

function clearPendingHello(error) {
  const pending = state.pendingHello;
  if (!pending) return;
  state.pendingHello = null;
  clearTimeout(pending.timer);
  if (error) pending.reject(error);
}

function clearRoomJoinWaiter(error) {
  const waiter = state.roomJoinWaiter;
  if (!waiter) return;
  state.roomJoinWaiter = null;
  clearTimeout(waiter.timer);
  if (error) waiter.reject(error);
}

function waitForRoomJoin(transport, timeout = 16000) {
  clearRoomJoinWaiter();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (state.roomJoinWaiter?.transport !== transport) return;
      state.roomJoinWaiter = null;
      reject(Object.assign(new Error('The host did not confirm your seat in time.'), { code: 'JOIN_TIMEOUT' }));
    }, timeout);
    state.roomJoinWaiter = { transport, resolve, reject, timer };
  });
}

function rejectRoomJoin(error) {
  const waiter = state.roomJoinWaiter;
  if (!waiter) return;
  clearRoomJoinWaiter(error);
}

function resetNetworkSession() {
  clearTimeout(state.netReconnectTimer);
  state.netReconnectTimer = null;
  clearRoomJoinWaiter(Object.assign(new Error('Connection closed.'), { code: 'CONNECTION_CLOSED' }));
  clearPendingHello(Object.assign(new Error('Connection closed.'), { code: 'CONNECTION_CLOSED' }));
  if (state.codeWait) {
    clearTimeout(state.codeWait.timer);
    state.codeWait.reject(Object.assign(new Error('Room code change cancelled.'), { code: 'CODE_CHANGE_CANCELLED' }));
    state.codeWait = null;
  }
  try { state.hostTransport?.destroy({ notify: true }); } catch {}
  try { state.guestTransport?.destroy(); } catch {}
  state.hostTransport = null;
  state.guestTransport = null;
  state.hostRegistering = false;
  Object.assign(state.net, {
    role: null,
    status: 'idle',
    code: null,
    resumeToken: '',
    guest: null,
    retries: 0,
    error: '',
    signalingLost: false,
    hostGuests: 0,
    deckId: 'auto',
    contentOfferPending: false,
    contentRequestFor: '',
  });
  sessionStorage.removeItem(NET_ROLE_KEY);
  sessionStorage.removeItem(NET_TOKEN_KEY);
  paintNetStatus();
}

function resetRoomState({ network = true } = {}) {
  state.pendingRoomDeckId = null;
  state.roomCode = null;
  localStorage.removeItem(ROOM_KEY);
  state.lobby = null;
  state.game = null;
  state.gameRoom = null;
  state.spectator = false;
  state.lastLobbyRevision = -1;
  state.lastGameRevision = -1;
  state.roomManifest = null;
  state.roomCatalogVersion = 0;
  if (state.basePool) {
    state.pool = state.basePool;
    state.basePool = null;
    state.remotePoolIds.clear();
    setCardIndex(state.pool);
    state.libraryVersion++;
  }
  if (network) resetNetworkSession();
}


function mergeRoomCatalog(msg) {
  if (!msg || !Array.isArray(msg.cards)) return;
  if (msg.roomCode && state.roomCode && msg.roomCode !== state.roomCode) return;
  if (Number(msg.catalogVersion || 0) < Number(state.roomCatalogVersion || 0)) return;
  if (!state.basePool) state.basePool = state.pool;
  const merged = new Map(state.basePool.map((card) => [card.id, card]));
  for (const card of msg.cards) {
    if (!card?.id) continue;
    merged.set(card.id, card);
    state.remotePoolIds.add(card.id);
  }
  state.pool = [...merged.values()];
  state.roomCatalogVersion = Number(msg.catalogVersion || state.roomCatalogVersion || 1);
  state.roomManifest = msg.manifest || state.roomManifest;
  setCardIndex(state.pool);
  state.libraryVersion++;
}

function saveRoomCode(code) {
  state.roomCode = code;
  state.net.code = code;
  if (code) localStorage.setItem(ROOM_KEY, code);
  else localStorage.removeItem(ROOM_KEY);
}

function requestNewRoomCode() {
  if (!state.roomCode) return Promise.reject(new Error('No room is open.'));
  if (state.codeWait) return Promise.reject(new Error('A room code change is already pending.'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (state.codeWait?.reject === reject) state.codeWait = null;
      reject(Object.assign(new Error('The desktop service did not issue a new room code.'), { code: 'CODE_CHANGE_TIMEOUT' }));
    }, 6000);
    state.codeWait = { resolve, reject, timer };
    if (!wsSend('regenerateRoomCode')) {
      clearTimeout(timer);
      state.codeWait = null;
      reject(Object.assign(new Error('Could not ask for another room code.'), { code: 'CODE_CHANGE_FAILED' }));
    }
  });
}

async function startHostRegistration() {
  if (!state.desktop || state.net.role !== 'host' || !state.roomCode || state.hostRegistering) return;
  state.hostRegistering = true;
  try {
    if (!state.hostTransport) {
      state.hostTransport = new HostTransport({
        bridge: window.nexusDesktop?.peer,
        iceServers: state.desktopConfig?.iceServers || [],
        onStatus: handleHostStatus,
        onPeerOpen: () => {
          state.net.hostGuests = state.hostTransport?.connectedPeerCount || 0;
          paintNetStatus();
        },
        onPeerClose: () => {
          state.net.hostGuests = state.hostTransport?.connectedPeerCount || 0;
          paintNetStatus();
        },
        onError: (err) => {
          if (state.net.role !== 'host') return;
          state.net.error = err?.message || String(err);
          if (err?.code !== 'unavailable-id') toast(state.net.error, 'error');
          paintNetStatus();
        },
      });
    }
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await state.hostTransport.start(state.roomCode);
        setNet({ status: 'hosting', signalingLost: false, error: '', retries: 0 });
        return;
      } catch (err) {
        if (err.code === 'unavailable-id' && attempt < 3) {
          setNet({ status: 'registering', error: err.message });
          await requestNewRoomCode();
          continue;
        }
        throw err;
      }
    }
  } catch (err) {
    await failHostRegistration(err);
  } finally {
    state.hostRegistering = false;
  }
}

async function failHostRegistration(err) {
  const message = err?.code === 'unavailable-id'
    ? 'Every generated room code is currently taken. Close the room and try again.'
    : (err?.message || 'Could not publish the room to the internet.');
  if (state.net.role !== 'host') return;
  state.net.error = message;
  setNet({ status: 'failed', error: message });
  toast(message, 'error');
  try { state.hostTransport?.destroy({ notify: true }); } catch {}
  state.hostTransport = null;
  if (state.ws?.readyState === WebSocket.OPEN) wsSend('leave');
  setTimeout(() => {
    if (state.net.role === 'host' && !state.hostTransport) {
      resetRoomState();
      navigate('#/');
      renderApp();
    }
  }, 900);
}

function handleHostStatus(status, detail = {}) {
  if (state.net.role !== 'host') return;
  if (status === 'hosting') {
    state.net.hostGuests = state.hostTransport?.connectedPeerCount || detail.guests || state.net.hostGuests;
    setNet({ status: 'hosting', signalingLost: false, error: '' });
    return;
  }
  if (status === 'registering') {
    setNet({ status: 'registering' });
    return;
  }
  if (status === 'signaling-lost') {
    state.net.signalingLost = true;
    paintNetStatus();
    if (state.lobby) renderApp();
    return;
  }
  if (status === 'signaling-failed') {
    state.net.signalingLost = true;
    state.net.error = 'Signaling is unavailable. Guests already in the room can keep playing, but new guests cannot join.';
    paintNetStatus();
    toast(state.net.error, 'error');
    if (state.lobby) renderApp();
  }
}

function handleGuestClosed(reason) {
  if (state.net.role !== 'guest' || state.net.status === 'leaving' || state.net.status === 'failed') return;
  const error = Object.assign(new Error('The connection to the host closed.'), { code: 'CONNECTION_CLOSED', reason });
  clearPendingHello(error);
  rejectRoomJoin(error);
  if (state.net.status === 'connected') scheduleGuestReconnect();
}

function handleGuestTransportError(err) {
  if (state.net.role !== 'guest') return;
  if (err?.code === 'signaling-lost') {
    state.net.signalingLost = true;
    paintNetStatus();
    return;
  }
  const message = err?.message || 'Peer connection error.';
  if (state.net.status === 'connected') {
    toast(message, 'error');
    state.net.signalingLost = true;
    paintNetStatus();
  }
}

function handlePeerData(raw, sourceTransport = state.guestTransport) {
  if (sourceTransport && sourceTransport !== state.guestTransport) return;
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'peerWelcome' || msg.type === 'peerError') {
    if (handleHandshakeMessage(msg)) return;
  }
  if (msg.type === 'peerError') {
    toast(msg.message || 'The host rejected the connection.', 'error');
    return;
  }
  handleMessage(msg);
}

function handleHandshakeMessage(msg) {
  const pending = state.pendingHello;
  if (!pending) return false;
  if (msg.type === 'peerError') {
    state.pendingHello = null;
    clearTimeout(pending.timer);
    pending.reject(Object.assign(new Error(msg.message || 'The host rejected the connection.'), { code: msg.code || 'PEER_REJECTED' }));
    return true;
  }
  if (msg.type !== 'peerWelcome') return false;
  state.pendingHello = null;
  clearTimeout(pending.timer);
  const compatibility = compareManifests(state.meta?.contentManifest, msg.manifest);
  if (!compatibility.ok) {
    pending.reject(Object.assign(new Error(compatibility.errors.join(' ')), { code: 'CONTENT_MISMATCH' }));
    return true;
  }
  if (compatibility.warnings.length) toast(compatibility.warnings.join(' '), 'gold');
  pending.resolve(msg);
  return true;
}

async function guestHello(transport, { code, resumeToken }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (state.pendingHello?.reject !== reject) return;
      state.pendingHello = null;
      reject(Object.assign(new Error('The host handshake timed out.'), { code: 'HANDSHAKE_TIMEOUT' }));
    }, 13000);
    state.pendingHello = { resolve, reject, timer, transport };
    const hello = {
      type: 'peerHello',
      protocol: state.meta?.protocol || 1,
      code,
      appVersion: state.meta?.appVersion || '',
      manifest: state.meta?.contentManifest || null,
      resumeToken: resumeToken || undefined,
    };
    if (!transport.send(JSON.stringify(hello))) {
      state.pendingHello = null;
      clearTimeout(timer);
      reject(Object.assign(new Error('Could not send the peer handshake.'), { code: 'SEND_FAILED' }));
    }
  });
}

async function openGuestConnection({ code, name, spectator = false, resumeToken = null, reconnecting = false }) {
  const transport = new GuestTransport({
    iceServers: state.desktopConfig?.iceServers || [],
    onStatus: (status) => {
      if (state.guestTransport !== transport) return;
      if (status === 'signaling-lost') {
        state.net.signalingLost = true;
        paintNetStatus();
      } else if (status === 'hosting') {
        // GuestTransport does not emit this status; reserved for parity.
      }
    },
    onData: (data) => handlePeerData(data, transport),
    onClose: ({ reason }) => {
      if (state.guestTransport !== transport) return;
      handleGuestClosed(reason);
    },
    onError: (err) => {
      if (state.guestTransport === transport) handleGuestTransportError(err);
    },
  });
  const previousTransport = state.guestTransport;
  if (previousTransport && previousTransport !== transport) {
    try { previousTransport.destroy(); } catch {}
  }
  state.guestTransport = transport;
  // A resumed seat is confirmed immediately after peerWelcome, so the roomJoined
  // waiter must exist before the handshake is sent. Without that, a fast host can
  // finish the resume before the client starts listening and the join hangs.
  const earlyJoin = resumeToken ? waitForRoomJoin(transport, 16000) : null;
  let welcome;
  try {
    await transport.connect(code);
    welcome = await guestHello(transport, { code, resumeToken });

    // Create the seat waiter before the host can deliver roomJoined. PeerJS keeps
    // message ordering, but the waiter must exist before the next browser task.
    const joinPromise = earlyJoin || waitForRoomJoin(transport, 16000);
    state.net.signalingLost = false;
    if (!welcome.resume) {
      if (!peerSend(spectator ? 'spectate' : 'join', { code, name }, transport)) {
        throw Object.assign(new Error('Could not ask the host for a seat.'), { code: 'SEND_FAILED' });
      }
    }
    await joinPromise; // resolves in handleMessage('roomJoined')
    return welcome;
  } catch (err) {
    if (earlyJoin) rejectRoomJoin(err);
    throw err;
  }
}

async function startGuestJoin({ code, name, spectator = false }) {
  if (!state.desktop) {
    return false;
  }
  if (!state.meta) {
    toast('The game is still starting.', 'error');
    return false;
  }
  if (state.net.role === 'guest') {
    try { state.guestTransport?.destroy(); } catch {}
    state.guestTransport = null;
  }
  state.net.guest = { code, name, spectator };
  state.net.deckId = 'auto';
  setNet({ role: 'guest', status: 'joining', code, error: '', retries: 0, signalingLost: false });
  try {
    await openGuestConnection({ code, name, spectator });
    return true;
  } catch (err) {
    failGuestConnection(err, { navigate: false, initial: true });
    return false;
  }
}

function scheduleGuestReconnect() {
  if (state.net.role !== 'guest' || state.net.status === 'leaving' || state.net.status === 'failed') return;
  if (state.netReconnectTimer) return;
  const attempt = Number(state.net.retries || 0);
  if (attempt >= MAX_RECONNECT_ATTEMPTS) {
    failGuestConnection(Object.assign(new Error('Could not reconnect to the host after several attempts.'), { code: 'RECONNECT_EXHAUSTED' }));
    return;
  }
  const next = attempt + 1;
  state.net.retries = next;
  setNet({ status: 'reconnecting', error: '', signalingLost: false });
  const delay = Math.min(8000, 700 * (2 ** attempt));
  state.netReconnectTimer = setTimeout(async () => {
    state.netReconnectTimer = null;
    if (state.net.role !== 'guest' || state.net.status !== 'reconnecting') return;
    const guest = state.net.guest || { code: state.roomCode, name: state.playerName, spectator: false };
    try {
      await openGuestConnection({
        code: guest.code || state.roomCode,
        name: guest.name || state.playerName,
        spectator: !!guest.spectator,
        resumeToken: state.net.resumeToken,
        reconnecting: true,
      });
    } catch (err) {
      if (isPermanentGuestFailure(err)) {
        failGuestConnection(err);
      } else {
        scheduleGuestReconnect();
      }
    }
  }, delay);
}

function isPermanentGuestFailure(err) {
  return ['CONTENT_MISMATCH', 'PROTOCOL_MISMATCH', 'RESUME_FAILED', 'ROOM_NOT_FOUND', 'ROOM_FULL', 'INVALID_CODE', 'KICKED', 'NO_BRIDGE', 'NO_PEERJS'].includes(err?.code);
}

function failGuestConnection(reason, { navigate: goHome = true, initial = false } = {}) {
  const message = reason?.message || String(reason || 'The internet connection failed.');
  if (state.net.role === 'guest') toast(message, 'error');
  const shouldNavigate = goHome && (location.hash === '#/lobby' || location.hash === '#/game');
  clearTimeout(state.netReconnectTimer);
  state.netReconnectTimer = null;
  resetRoomState();
  state.net.error = '';
  paintNetStatus();
  if (shouldNavigate || initial) {
    if (shouldNavigate) navigate('#/');
    else renderApp();
  } else {
    renderApp();
  }
}

export function cancelReconnect() {
  if (state.net.role !== 'guest') return;
  failGuestConnection(new Error('Reconnect cancelled.'), { navigate: true });
}

export async function submitGuestDeck(deckId) {
  if (!state.desktop || state.net.role !== 'guest') return false;
  state.net.deckId = deckId || 'auto';
  if (!deckId || deckId === 'auto') {
    const sent = send('setDeck', { deckId: 'auto' });
    renderApp();
    return sent;
  }
  try {
    const data = await apiGet(`/api/decks/${encodeURIComponent(deckId)}`);
    const deck = data?.deck;
    if (!deck) throw new Error('Deck not found.');
    const cards = (deck.cards || []).map((entry) => ({
      cardId: entry.cardId || entry.id || entry.card?.id,
      count: Number(entry.count || entry.quantity || 1),
    })).filter((entry) => entry.cardId);
    if (!cards.length) throw new Error('That deck is empty.');
    const sent = send('setDeck', { deck: { name: deck.name, cards, regions: deck.regions || [] } });
    if (sent) {
      toast(`Submitting “${deck.name}” to the host…`, 'gold');
    }
    renderApp();
    return sent;
  } catch (err) {
    toast(err.message || 'Could not load that deck.', 'error');
  }
  renderApp();
  return false;
}

async function offerCustomContent(unknownCards) {
  if (!state.desktop || state.net.role !== 'guest' || !Array.isArray(unknownCards) || !unknownCards.length) return;
  if (state.net.contentOfferPending) return;
  const key = [...unknownCards].sort().join(',');
  if (state.net.contentRequestFor === key) return;
  state.net.contentRequestFor = key;
  state.net.contentOfferPending = true;
  try {
    const data = await apiPost('/api/content/export', { cardIds: unknownCards });
    if (!data?.cards?.length) {
      toast('This deck uses cards that are not available in your own Card Forge either. Edit the deck first.', 'error');
      return;
    }
    if (send('offerContent', { cards: data.cards, scripts: data.scripts })) {
      toast('Custom cards sent to the host for approval.', 'gold');
    }
  } catch (err) {
    toast(err.message || 'Could not prepare the custom content.', 'error');
  } finally {
    state.net.contentOfferPending = false;
    paintNetStatus();
  }
}

export async function joinRoom(code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) { toast('Enter a room code.', 'error'); return; }
  if (state.desktop && !/^[A-Z2-9]{5}$/.test(clean)) {
    toast('Internet room codes are five characters (A–Z and 2–9).', 'error');
    return;
  }
  const name = await ensureName();
  if (!name) return;
  state.pendingJoin = '';
  if (state.desktop) {
    await startGuestJoin({ code: clean, name, spectator: false });
  } else {
    send('join', { code: clean, name });
  }
}

export async function spectateRoom(code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) { toast('Enter a room code.', 'error'); return; }
  if (state.desktop && !/^[A-Z2-9]{5}$/.test(clean)) {
    toast('Internet room codes are five characters (A–Z and 2–9).', 'error');
    return;
  }
  const name = (await ensureName()) || 'Spectator';
  state.pendingJoin = '';
  if (state.desktop) {
    await startGuestJoin({ code: clean, name, spectator: true });
  } else {
    send('spectate', { code: clean, name });
  }
}

export function leaveRoom() {
  if (state.desktop && state.net.role === 'guest') {
    state.net.status = 'leaving';
    paintNetStatus();
    peerSend('leave', {});
    const transport = state.guestTransport;
    setTimeout(() => {
      try { transport?.destroy(); } catch {}
      resetRoomState();
      navigate('#/');
      renderApp();
    }, 250);
    return;
  }
  if (state.desktop && state.net.role === 'host') {
    state.net.status = 'leaving';
    paintNetStatus();
    try { wsSend('leave'); } catch {}
    setTimeout(() => {
      resetRoomState();
      if (location.hash === '#/lobby' || location.hash === '#/game') navigate('#/');
      renderApp();
    }, 1200);
    return;
  }
  send('leave');
}

function updateConnection() {
  document.querySelectorAll('.home-online-action').forEach((button) => { button.disabled = !state.connected; });
  document.querySelectorAll('.deck-online-action').forEach((button) => {
    button.disabled = !state.connected || button.dataset.locked === 'true' || button.dataset.submitting === 'true';
  });
  document.querySelectorAll('.conn').forEach((el) => {
    el.classList.toggle('on', state.connected);
    el.classList.toggle('off', !state.connected);
    el.innerHTML = `<span class="conn-dot"></span>${state.connected ? 'Desktop service' : 'Reconnecting…'}`;
  });
  paintNetStatus();
}

function connect() {
  if (state.connecting) return;
  state.connecting = true;
  try {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    state.ws = ws;
    ws.addEventListener('open', () => {
      state.connected = true;
      state.connecting = false;
      state.reconnectDelay = 1000;
      updateConnection();
      send('hello', { clientId: state.clientId });
      const guestInternetSeat = state.desktop && state.net.role === 'guest';
      if (state.roomCode && !guestInternetSeat) {
        // Local browser rooms and the host's own seat restore through the local
        // service. Internet guests restore through their PeerJS resume token.
        send('join', { code: state.roomCode, name: state.playerName });
      }
    });
    ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      handleMessage(msg);
    });
    ws.addEventListener('close', () => {
      state.connected = false;
      state.connecting = false;
      updateConnection();
      if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(() => {
        state.reconnectDelay = Math.min(8000, state.reconnectDelay * 1.6);
        connect();
      }, state.reconnectDelay);
    });
    ws.addEventListener('error', () => {
      try { ws.close(); } catch {}
    });
  } catch {
    state.connecting = false;
    updateConnection();
  }
}

function handleGuestJoinError(msg) {
  if (!state.roomJoinWaiter) return false;
  if (!['ROOM_NOT_FOUND', 'ROOM_FULL', 'CONTENT_REQUIRED', 'CONTENT_MISMATCH'].includes(msg.code)) return false;
  rejectRoomJoin(Object.assign(new Error(msg.message || 'The host rejected your seat.'), { code: msg.code || 'JOIN_REJECTED' }));
  return true;
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'welcome': {
      if (msg.clientId) {
        state.clientId = msg.clientId;
        localStorage.setItem(CLIENT_KEY, state.clientId);
      }
      state.welcome = msg;
      break;
    }
    case 'roomCreated': {
      saveRoomCode(msg.code);
      const deckId = state.pendingRoomDeckId;
      state.pendingRoomDeckId = null;
      if (deckId) send('setDeck', { deckId });
      state.lastLobbyRevision = -1;
      state.lastGameRevision = -1;
      state.net.role = 'host';
      if (state.desktop) {
        sessionStorage.setItem(NET_ROLE_KEY, 'host');
        setNet({ status: 'registering', error: '', signalingLost: false, hostGuests: 0 });
        startHostRegistration();
      }
      if (location.hash !== '#/game' && location.hash !== '#/lobby') navigate('#/lobby');
      break;
    }
    case 'roomCodeChanged': {
      saveRoomCode(msg.code);
      state.net.code = msg.code;
      const wait = state.codeWait;
      if (wait) {
        state.codeWait = null;
        clearTimeout(wait.timer);
        wait.resolve(msg.code);
      }
      toast(`Room code updated to ${msg.code}.`, 'gold');
      paintNetStatus();
      renderApp();
      break;
    }
    case 'roomJoined': {
      const previousStatus = state.net.status;
      saveRoomCode(msg.code);
      state.spectator = !!msg.spectator || (msg.playerId == null && !msg.reconnect);
      state.lastLobbyRevision = -1;
      state.lastGameRevision = -1;
      if (state.desktop) {
        if (state.net.role === 'host') {
          sessionStorage.setItem(NET_ROLE_KEY, 'host');
          if (!state.hostTransport) startHostRegistration();
        } else {
          state.net.role = 'guest';
          state.net.status = 'connected';
          state.net.retries = 0;
          state.net.error = '';
          state.net.signalingLost = false;
          if (msg.reconnectToken) {
            state.net.resumeToken = msg.reconnectToken;
          }
          const existing = state.net.guest || {};
          state.net.guest = {
            code: msg.code,
            name: existing.name || state.playerName,
            spectator: state.spectator,
          };
          saveGuestSession();
          paintNetStatus();
          if (previousStatus === 'reconnecting' || msg.reconnect) toast('Reconnected to the host.', 'success');
        }
      }
      const waiter = state.roomJoinWaiter;
      if (waiter) {
        clearTimeout(waiter.timer);
        state.roomJoinWaiter = null;
        waiter.resolve(msg);
      }
      if (location.hash !== '#/game' && location.hash !== '#/lobby') navigate('#/lobby');
      else renderApp();
      break;
    }
    case 'lobby': {
      if (msg.room?.code && state.roomCode && msg.room.code !== state.roomCode) break;
      if (Number.isFinite(msg.revision) && msg.revision < state.lastLobbyRevision) break;
      if (Number.isFinite(msg.revision)) state.lastLobbyRevision = msg.revision;
      state.lobby = msg.room;
      state.roomCode = msg.room?.code || state.roomCode;
      state.spectator = !msg.room?.players?.some((p) => p.isYou);
      if (state.net.role === 'guest' && state.net.guest) state.net.guest.spectator = state.spectator;
      if (state.game && msg.room?.started && location.hash === '#/game') {
        renderApp();
        break;
      }
      // Room snapshots must not interrupt a collection search or unsaved edit.
      if (location.hash === '#/decks' || location.hash.startsWith('#/deck/') || location.hash === '#/collection/decks') break;
      if (location.hash === '#/play') renderApp();
      else if (location.hash !== '#/lobby') navigate('#/lobby');
      else renderApp();
      break;
    }
    case 'game': {
      if (msg.room?.code && state.roomCode && msg.room.code !== state.roomCode) break;
      if (Number.isFinite(msg.revision) && msg.revision < state.lastGameRevision) break;
      if (Number.isFinite(msg.revision)) state.lastGameRevision = msg.revision;
      state.game = msg.view;
      state.gameRoom = msg.room || state.gameRoom;
      state.roomCode = msg.room?.code || state.roomCode;
      state.spectator = !!msg.spectator || !msg.view?.you;
      if (state.lobby) state.lobby.started = true;
      if (location.hash !== '#/game') navigate('#/game');
      else renderApp();
      break;
    }
    case 'roomCatalog': {
      mergeRoomCatalog(msg);
      // The room catalog can arrive before or after the first lobby snapshot;
      // re-render so custom cards and resolved target specs appear immediately.
      renderApp();
      break;
    }
    case 'error': {
      if (state.desktop && state.net.role === 'guest' && handleGuestJoinError(msg)) break;
      if (msg.code === 'CONTENT_REQUIRED' && state.desktop && state.net.role === 'guest') {
        if (!state.net.contentOfferPending && state.net.contentRequestFor !== [...(msg.unknownCards || [])].sort().join(',')) {
          offerCustomContent(msg.unknownCards || []);
        }
        toast(msg.message || 'Custom content needs host approval.', 'gold');
        break;
      }
      toast(msg.message || 'Something went wrong.', 'error');
      if (msg.code === 'ROOM_NOT_FOUND' || /room not found/i.test(msg.message || '')) {
        state.pendingJoin = '';
        if (state.desktop && state.net.role === 'guest') {
          failGuestConnection(Object.assign(new Error(msg.message || 'Room not found.'), { code: msg.code }));
        } else {
          resetRoomState();
          if (location.hash === '#/lobby' || location.hash === '#/game') navigate('#/');
        }
      }
      break;
    }
    case 'deckAccepted': {
      toast(`Deck accepted${msg.deck?.name ? `: ${msg.deck.name}` : ''}.`, 'success');
      break;
    }
    case 'contentQueued': {
      toast(msg.message || 'Waiting for the host to approve your custom content.', 'gold');
      break;
    }
    case 'contentApproved': {
      state.net.contentRequestFor = '';
      toast(msg.deckAccepted ? 'Custom content approved and your deck was accepted.' : 'The host approved your custom content.', 'success');
      break;
    }
    case 'contentRejected': {
      state.net.contentRequestFor = '';
      toast(msg.message || 'The host declined the custom content. Choose another deck.', 'error');
      break;
    }
    case 'roomClosed': {
      const reason = msg.reason === 'host-left'
        ? 'The host closed the room.'
        : (msg.reason === 'kicked' ? 'You were removed from the room.' : 'The room closed.');
      failGuestConnection(new Error(reason), { navigate: true });
      break;
    }
    case 'kicked': {
      failGuestConnection(new Error('You were removed from the room.'), { navigate: true });
      break;
    }
    case 'leftRoom': {
      resetRoomState();
      navigate('#/');
      break;
    }
    case 'pong': break;
    default: break;
  }
}

function topbarHtml() {
  const path = state.route || '/';
  const netInfo = netStatusInfo();
  const nav = [
    { href: '#/', label: 'Home', match: (p) => p === '/' || p.startsWith('/join') },
    { href: '#/decks', label: 'Deck Builder', match: (p) => p.startsWith('/deck') || p === '/decks' },
  ];
  if (state.roomCode) nav.push({ href: '#/lobby', label: 'Lobby', match: (p) => p === '/lobby' });
  if (state.game) nav.push({ href: '#/game', label: 'Battle', match: (p) => p === '/game' });
  nav.push({ href: '#/admin', label: 'Card Forge', match: (p) => p.startsWith('/admin') });
  const netChip = state.net.role
    ? `<span class="tag net-chip net-${esc(netInfo.tone)}" data-net-status title="Internet room status">${esc(netInfo.label)}</span>`
    : '';
  return `<header class="topbar">
    <a class="brand" href="#/" aria-label="Nexus Forge home">
      <span class="brand-mark">✦</span>
      <span><span class="brand-name">NEXUS FORGE</span><br><span class="brand-sub">Runeterra Card Table</span></span>
    </a>
    <nav class="nav">
      ${nav.map((n) => `<a href="${n.href}" class="${n.match(path) ? 'active' : ''}">${n.label}</a>`).join('')}
      ${netChip}
      <span class="conn ${state.connected ? 'on' : 'off'}" title="Local desktop service"><span class="conn-dot"></span>${state.connected ? 'Desktop service' : 'Reconnecting…'}</span>
      ${state.playerName ? `<span class="tag gold" title="Your display name">${esc(state.playerName)}</span>` : ''}
    </nav>
  </header>`;
}

function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  if (raw.startsWith('/join/')) {
    state.pendingJoin = raw.slice('/join/'.length).split('?')[0].toUpperCase();
    state.route = '/';
    return { name: 'home' };
  }
  if (raw.startsWith('/deck/')) {
    state.route = raw;
    state.deckEditId = decodeURIComponent(raw.slice('/deck/'.length));
    return { name: 'decks' };
  }
  if (raw.startsWith('/decks')) { state.route = '/decks'; return { name: 'decks' }; }
  if (raw === '/collection/decks') { state.route = raw; return { name: 'collectionDecks' }; }
  if (raw === '/play') { state.route = '/play'; return { name: 'selection' }; }
  if (raw.startsWith('/lobby')) { state.route = '/lobby'; return { name: 'lobby' }; }
  if (raw.startsWith('/game')) { state.route = '/game'; return { name: 'game' }; }
  if (raw.startsWith('/admin')) { state.route = '/admin'; return { name: 'admin' }; }
  state.route = '/';
  return { name: 'home' };
}

function viewRoot() {
  const existing = document.getElementById('view');
  const main = document.createElement('main');
  main.id = 'view';
  main.className = 'page';
  if (existing) existing.replaceWith(main);
  else document.querySelector('.app-shell')?.appendChild(main);
  return main;
}

export function renderApp() {
  const app = document.getElementById('app');
  if (!app) return;
  if (state.bootError) {
    app.innerHTML = `<div class="boot"><div class="boot-mark">✦</div><div class="boot-title">NEXUS FORGE</div><div class="boot-sub">The forge could not be lit.</div><div class="notice warn" style="margin-top:14px">${state.bootError}</div><button class="btn btn-primary" id="retry-boot">Retry</button></div>`;
    document.getElementById('retry-boot')?.addEventListener('click', () => boot());
    return;
  }
  if (!state.meta || !state.pool.length) {
    app.innerHTML = `<div class="boot"><div class="boot-mark">✦</div><div class="boot-title">NEXUS FORGE</div><div class="boot-sub">Forging the card pool…</div><div class="loader" style="margin-top:8px"></div></div>`;
    return;
  }
  const route = parseRoute();
  document.body.classList.toggle('game-mode', route.name === 'game' && !!state.game);
  const homeRoute = route.name === 'home' || (route.name === 'lobby' && !state.lobby) || (route.name === 'game' && !state.game);
  document.body.classList.toggle('home-mode', homeRoute);
  document.body.classList.toggle('deck-selection-mode', route.name === 'selection' || route.name === 'collectionDecks');
  document.body.classList.toggle('collection-mode', route.name === 'decks');
  const oldShell = app.querySelector('.app-shell');
  if (!oldShell) {
    app.innerHTML = `<div class="app-shell">${topbarHtml()}<main id="view" class="page"></main></div>`;
  } else {
    // Rebuild the topbar only; the view function manages its own contents.
    const header = oldShell.querySelector('.topbar');
    if (header) header.outerHTML = topbarHtml();
  }
  const main = document.getElementById('view');
  if (!main) return;
  // Let the picker preserve keyboard focus during live room updates.
  if (!['selection', 'collectionDecks'].includes(route.name)) main.replaceChildren();
  main.className = 'page';
  const ctx = {
    state,
    navigate,
    send,
    toast,
    openModal,
    closeModal,
    modalPrompt,
    modalConfirm,
    copyText,
    refreshDecks,
    refreshPool,
    refreshMeta,
    createRoom,
    joinRoom,
    spectateRoom,
    leaveRoom,
    submitGuestDeck,
    cancelReconnect,
    offerCustomContent,
  };
  if (route.name === 'selection') renderDeckSelection(main, ctx);
  else if (route.name === 'collectionDecks') renderDeckSelection(main, ctx, { collection: true });
  else if (route.name === 'decks') renderDeckBuilder(main, ctx);
  else if (route.name === 'lobby') {
    if (!state.lobby) renderHome(main, ctx);
    else { main.classList.add('narrow'); renderLobby(main, ctx); }
  } else if (route.name === 'game') {
    if (!state.game) renderHome(main, ctx);
    else { renderGame(main, ctx); }
  } else if (route.name === 'admin') {
    renderAdmin(main, ctx);
  } else {
    renderHome(main, ctx);
  }
  paintNetStatus();
}

async function boot() {
  state.bootError = '';
  renderApp();
  try {
    if (window.nexusDesktop?.isDesktop) {
      state.desktop = true;
      try {
        state.desktopConfig = await window.nexusDesktop.getConfig();
        const token = await window.nexusDesktop.getAdminToken();
        if (token) setAdminToken(token, false);
      } catch {
        state.desktopConfig = null;
      }
    }
    const [meta, pool, decksData] = await Promise.all([
      apiGet('/api/meta'),
      apiGet('/api/cardpool'),
      apiGet('/api/decks'),
    ]);
    state.meta = meta;
    state.desktop = state.desktop || !!meta.desktop;
    state.pool = pool.cards || [];
    state.decks = decksData.decks || [];
    setCardIndex(state.pool);
    state.libraryVersion++;
    if (state.desktop && !state.net.role) {
      // Room codes from browser sessions cannot be resumed by a new desktop
      // process. Keep same-tab reloads (sessionStorage) as the recoverable case.
      saveRoomCode(null);
    }
    renderApp();
  } catch (err) {
    state.bootError = err.message || 'Could not reach the Nexus Forge server.';
    renderApp();
    return;
  }
  connect();
  restoreDesktopSession();
}

function restoreDesktopSession() {
  if (!state.desktop) return;
  if (state.net.role === 'guest' && state.roomCode && state.net.resumeToken) {
    state.net.guest = {
      code: state.roomCode,
      name: state.playerName,
      spectator: state.spectator,
    };
    setNet({ status: 'reconnecting', retries: 0, error: '' });
    (async () => {
      try {
        await openGuestConnection({
          code: state.roomCode,
          name: state.playerName,
          spectator: state.spectator,
          resumeToken: state.net.resumeToken,
          reconnecting: true,
        });
      } catch (err) {
        if (isPermanentGuestFailure(err)) failGuestConnection(err);
        else scheduleGuestReconnect();
      }
    })();
    return;
  }
  if (state.net.role === 'host' && state.roomCode) {
    setNet({ status: 'reconnecting', error: '' });
    // The local WebSocket reconnect joins the existing host seat; roomJoined
    // triggers re-registration of the PeerJS room address.
    return;
  }
  if (state.net.role && (!state.roomCode || (state.net.role === 'guest' && !state.net.resumeToken))) {
    resetNetworkSession();
    saveRoomCode(null);
  }
}

initTooltips();
window.addEventListener('hashchange', () => {
  closeModal();
  renderApp();
});
window.addEventListener('beforeunload', () => {
  try { state.hostTransport?.destroy({ notify: true }); } catch {}
  try { state.guestTransport?.destroy(); } catch {}
  try { state.ws?.close(); } catch {}
});
boot();
