// Transport-neutral client message dispatch. Both the WebSocket adapter and the
// PeerJS adapter use this path so room and game behavior cannot drift.
import {
  GAME_MESSAGE_TYPES, HOST_ONLY_TYPES, MUTATING_MESSAGE_TYPES, ROOM_MESSAGE_TYPES,
} from '../shared/protocol.js';

const COMMAND_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

export function sanitizeCommandId(value) {
  const id = String(value || '').trim();
  return COMMAND_ID_RE.test(id) ? id : '';
}

export function dispatchClientMessage({ conn, msg, rooms, transport = 'ws' }) {
  if (!conn || !conn.clientId) {
    rooms.error(conn, 'Send hello first.');
    return { ok: false };
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    rooms.error(conn, 'Invalid message.');
    return { ok: false };
  }
  if (typeof msg.type !== 'string' || !msg.type || msg.type.length > 40) {
    rooms.error(conn, 'Invalid message type.');
    return { ok: false };
  }
  const type = msg.type;
  if (type === 'ping') {
    rooms.send(conn, { type: 'pong' });
    return { ok: true };
  }
  if (!ROOM_MESSAGE_TYPES.has(type) && !GAME_MESSAGE_TYPES.has(type)) {
    rooms.error(conn, `Unknown message type: ${type}`);
    return { ok: false };
  }
  if (transport === 'peer' && HOST_ONLY_TYPES.has(type)) {
    rooms.error(conn, 'Only the host can do that.');
    return { ok: false };
  }

  let commandId = '';
  if (MUTATING_MESSAGE_TYPES.has(type)) {
    commandId = sanitizeCommandId(msg.commandId);
    if (transport === 'peer' && !commandId) {
      rooms.error(conn, 'This action needs a command identifier.');
      return { ok: false };
    }
    if (commandId && rooms.isDuplicateCommand(conn.clientId, commandId)) {
      return { ok: true, duplicate: true };
    }
  }

  const room = rooms.roomFor(conn);
  switch (type) {
    case 'create': rooms.createRoom(conn, msg.name); break;
    case 'join': rooms.joinRoom(conn, msg.code, msg.name, { transport }); break;
    case 'spectate': rooms.joinRoom(conn, msg.code, msg.name, { asSpectator: true, transport }); break;
    case 'leave': rooms.leaveRoom(conn); break;
    case 'setMode': rooms.setMode(conn, msg.mode); break;
    case 'move': rooms.movePlayer(conn, msg.playerId, msg.team); break;
    case 'kick': rooms.kick(conn, msg.playerId); break;
    case 'setDeck': rooms.setDeck(conn, msg); break;
    case 'ready': rooms.setReady(conn, msg.ready); break;
    case 'start': rooms.start(conn); break;
    case 'chat': rooms.chat(conn, msg.text); break;
    case 'rematch': rooms.rematch(conn); break;
    case 'offerContent': rooms.offerContent(conn, msg); break;
    case 'approveContent': rooms.approveContent(conn, msg.playerId); break;
    case 'rejectContent': rooms.rejectContent(conn, msg.playerId); break;
    case 'requestCatalog': rooms.sendCatalogTo(conn); break;
    default:
      if (GAME_MESSAGE_TYPES.has(type)) {
        if (!room) rooms.error(conn, 'Join a room first.');
        else rooms.action(conn, msg);
      } else {
        rooms.error(conn, `Unknown message type: ${type}`);
      }
  }
  return { ok: true, duplicate: false };
}
