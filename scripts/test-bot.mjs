// Local smoke-test bot for Nexus Forge. Not part of the game.
import WebSocket from 'ws';
import { readFile, writeFile, rm } from 'node:fs/promises';

const ROOM = process.env.ROOM || '';
const NAME = process.env.NAME || 'Ryze';
const CLIENT_ID = process.env.CLIENT_ID || 'testbot-ryze';
const AUTO_READY = process.env.AUTO_READY !== '0';
const CMD = process.env.CMD || 'C:/Users/tipsf/AppData/Local/Temp/opencode/nf-bot-cmd.json';
const STATE = process.env.STATE || 'C:/Users/tipsf/AppData/Local/Temp/opencode/nf-bot-state.json';
const URL = process.env.WS_URL || 'ws://localhost:3000/ws';

const ws = new WebSocket(URL);
let readySent = false;
let latest = null;

function send(type, payload = {}) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
}

ws.on('open', () => {
  console.log('[bot] connected');
  send('hello', { clientId: CLIENT_ID });
});

ws.on('message', async (raw) => {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return; }
  if (msg.type === 'welcome') {
    console.log('[bot] welcome', msg.clientId);
    if (ROOM) send('join', { code: ROOM, name: NAME });
  } else if (msg.type === 'roomJoined') {
    console.log('[bot] joined', msg.code);
  } else if (msg.type === 'lobby') {
    latest = { kind: 'lobby', at: Date.now(), room: msg.room };
    await writeFile(STATE, JSON.stringify(latest)).catch(() => {});
    const me = msg.room?.players?.find((p) => p.isYou);
    if (AUTO_READY && me && !me.ready && !readySent) {
      readySent = true;
      console.log('[bot] ready up');
      send('ready', { ready: true });
    }
  } else if (msg.type === 'game') {
    latest = { kind: 'game', at: Date.now(), room: msg.room, view: msg.view, spectator: msg.spectator };
    await writeFile(STATE, JSON.stringify(latest)).catch(() => {});
    if (msg.view?.phase && msg.view.phase !== latest.lastPhase) {
      latest.lastPhase = msg.view.phase;
      console.log(`[bot] game phase=${msg.view.phase} round=${msg.view.round} priority=${msg.view.priorityTeam} mulliganReady=${msg.view.you?.mulliganReady}`);
    }
  } else if (msg.type === 'error') {
    console.log('[bot] error:', msg.message);
  } else if (msg.type === 'leftRoom' || msg.type === 'kicked') {
    console.log('[bot]', msg.type);
  }
});

ws.on('close', () => console.log('[bot] closed'));
ws.on('error', (e) => console.log('[bot] socket error', e.message));

const poll = setInterval(async () => {
  try {
    const data = JSON.parse(await readFile(CMD, 'utf8'));
    await rm(CMD, { force: true });
    if (data?.type) {
      console.log('[bot] cmd', data.type, JSON.stringify(data).slice(0, 400));
      send(data.type, data);
    }
  } catch {}
}, 400);
setInterval(() => send('ping'), 15000);
process.on('SIGTERM', () => { clearInterval(poll); ws.close(); process.exit(0); });
process.on('SIGINT', () => { clearInterval(poll); ws.close(); process.exit(0); });
