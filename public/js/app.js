import { apiGet, apiPost, getAdminToken } from './api.js';
import { setCardIndex, initTooltips, toast, openModal, closeModal, modalPrompt, modalConfirm, copyText, esc } from './ui.js';
import { renderHome } from './views/home.js';
import { renderDeckBuilder } from './views/deckbuilder.js';
import { renderLobby } from './views/lobby.js';
import { renderGame } from './views/game.js';
import { renderAdmin } from './views/admin.js';

const CLIENT_KEY = 'nf.clientId';
const NAME_KEY = 'nf.playerName';
const ROOM_KEY = 'nf.roomCode';

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
  deckEditId: null,
  route: '',
  bootError: '',
  libraryVersion: 0,
};

export function navigate(path) {
  const hash = path.startsWith('#') ? path : `#${path}`;
  if (location.hash === hash) {
    renderApp();
    return;
  }
  location.hash = hash;
}

export function send(type, payload = {}) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    toast('Not connected to the server yet.', 'error');
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

export async function createRoom() {
  const name = await ensureName();
  if (!name) return;
  send('create', { name });
}

export async function joinRoom(code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) { toast('Enter a room code.', 'error'); return; }
  const name = await ensureName();
  if (!name) return;
  send('join', { code: clean, name });
}

export async function spectateRoom(code) {
  const name = (await ensureName()) || 'Spectator';
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) { toast('Enter a room code.', 'error'); return; }
  send('spectate', { code: clean, name });
}

export function leaveRoom() {
  send('leave');
}

function updateConnection() {
  document.querySelectorAll('.home-online-action').forEach((button) => { button.disabled = !state.connected; });
  document.querySelectorAll('.conn').forEach((el) => {
    el.classList.toggle('on', state.connected);
    el.classList.toggle('off', !state.connected);
    el.innerHTML = `<span class="conn-dot"></span>${state.connected ? 'Connected' : 'Reconnecting…'}`;
  });
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
      if (state.roomCode) {
        // A reconnect: the server restores the seat and sends the current view.
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

function resetRoomState() {
  state.roomCode = null;
  localStorage.removeItem(ROOM_KEY);
  state.lobby = null;
  state.game = null;
  state.gameRoom = null;
  state.spectator = false;
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'welcome': {
      if (msg.clientId) {
        state.clientId = msg.clientId;
        localStorage.setItem(CLIENT_KEY, msg.clientId);
      }
      state.welcome = msg;
      break;
    }
    case 'roomCreated':
    case 'roomJoined': {
      state.roomCode = msg.code;
      localStorage.setItem(ROOM_KEY, msg.code);
      state.spectator = !!msg.spectator || msg.playerId == null;
      if (location.hash !== '#/game' && location.hash !== '#/lobby') navigate('#/lobby');
      break;
    }
    case 'lobby': {
      state.lobby = msg.room;
      state.roomCode = msg.room?.code || state.roomCode;
      state.spectator = !msg.room?.players?.some((p) => p.isYou);
      if (state.game && msg.room?.started && location.hash === '#/game') break;
      if (location.hash !== '#/lobby') navigate('#/lobby');
      else renderApp();
      break;
    }
    case 'game': {
      state.game = msg.view;
      state.gameRoom = msg.room || state.gameRoom;
      state.roomCode = msg.room?.code || state.roomCode;
      state.spectator = !!msg.spectator || !msg.view?.you;
      if (state.lobby) state.lobby.started = true;
      if (location.hash !== '#/game') navigate('#/game');
      else renderApp();
      break;
    }
    case 'error': {
      toast(msg.message || 'Something went wrong.', 'error');
      if (msg.code === 'ROOM_NOT_FOUND' || /room not found/i.test(msg.message || '')) {
        state.pendingJoin = '';
        resetRoomState();
        if (location.hash === '#/lobby' || location.hash === '#/game') navigate('#/');
      }
      break;
    }
    case 'kicked': {
      resetRoomState();
      toast('You were removed from the room.', 'error');
      navigate('#/');
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
  const nav = [
    { href: '#/', label: 'Home', match: (p) => p === '/' || p.startsWith('/join') },
    { href: '#/decks', label: 'Deck Builder', match: (p) => p.startsWith('/deck') },
  ];
  if (state.roomCode) nav.push({ href: '#/lobby', label: 'Lobby', match: (p) => p === '/lobby' });
  if (state.game) nav.push({ href: '#/game', label: 'Battle', match: (p) => p === '/game' });
  nav.push({ href: '#/admin', label: 'Card Forge', match: (p) => p.startsWith('/admin') });
  return `<header class="topbar">
    <a class="brand" href="#/" aria-label="Nexus Forge home">
      <span class="brand-mark">✦</span>
      <span><span class="brand-name">NEXUS FORGE</span><br><span class="brand-sub">Runeterra Card Table</span></span>
    </a>
    <nav class="nav">
      ${nav.map((n) => `<a href="${n.href}" class="${n.match(path) ? 'active' : ''}">${n.label}</a>`).join('')}
      <span class="conn ${state.connected ? 'on' : 'off'}"><span class="conn-dot"></span>${state.connected ? 'Connected' : 'Reconnecting…'}</span>
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
  main.replaceChildren();
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
  };
  if (route.name === 'decks') renderDeckBuilder(main, ctx);
  else if (route.name === 'lobby') {
    if (!state.lobby) { renderHome(main, ctx); } else { main.classList.add('narrow'); renderLobby(main, ctx); }
  } else if (route.name === 'game') {
    if (!state.game) { renderHome(main, ctx); } else { renderGame(main, ctx); main.classList.remove('page'); main.classList.add('page'); }
  } else if (route.name === 'admin') {
    renderAdmin(main, ctx);
  } else {
    renderHome(main, ctx);
  }
}

async function boot() {
  state.bootError = '';
  renderApp();
  try {
    const [meta, pool, decksData] = await Promise.all([
      apiGet('/api/meta'),
      apiGet('/api/cardpool'),
      apiGet('/api/decks'),
    ]);
    state.meta = meta;
    state.pool = pool.cards || [];
    state.decks = decksData.decks || [];
    setCardIndex(state.pool);
    state.libraryVersion++;
    if (!state.playerName) {
      // Don't prompt on first load; the home screen asks when entering a room.
    }
    renderApp();
  } catch (err) {
    state.bootError = err.message || 'Could not reach the Nexus Forge server.';
    renderApp();
    return;
  }
  connect();
}

initTooltips();
window.addEventListener('hashchange', () => {
  closeModal();
  renderApp();
});
window.addEventListener('beforeunload', () => {
  try { state.ws?.close(); } catch {}
});
boot();
