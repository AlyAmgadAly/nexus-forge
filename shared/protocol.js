// Shared wire constants. Keep these stable: they define the peer namespace,
// message limits and the compatibility surface between desktop installations.

export const APP_VERSION = '0.2.0';
export const ENGINE_SCHEMA = 1;
export const PROTOCOL_VERSION = 1;

// The namespace is deliberately versioned independently from the app version and
// the room code. Codenames Masry's namespace is not reused.
export const PEER_NAMESPACE = 'nexus-forge-v1';
export const PEER_ID_PREFIX = `${PEER_NAMESPACE}-`;

export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;

export const MAX_PEER_MESSAGE_BYTES = 512 * 1024;
export const MAX_CONTENT_TRANSFER_BYTES = 512 * 1024;
export const MAX_CUSTOM_CARDS = 200;
export const MAX_CUSTOM_ART_BYTES = 192 * 1024;
export const MAX_SCRIPT_BYTES = 64 * 1024;
export const MAX_DECK_BYTES = 160 * 1024;
export const RECONNECT_GRACE_MS = 2 * 60 * 1000;
export const PEER_JOIN_TIMEOUT_MS = 12000;
export const PEER_HANDSHAKE_TIMEOUT_MS = 10000;

export const ROOM_MESSAGE_TYPES = new Set([
  'create', 'join', 'spectate', 'leave', 'setMode', 'move', 'kick', 'setDeck',
  'ready', 'start', 'chat', 'rematch', 'ping', 'offerContent', 'approveContent',
  'rejectContent', 'requestCatalog',
]);

export const HOST_ONLY_TYPES = new Set([
  'create', 'setMode', 'move', 'kick', 'start', 'rematch', 'approveContent', 'rejectContent',
]);

export const GAME_MESSAGE_TYPES = new Set([
  'mulligan', 'play', 'attack', 'block', 'pass', 'choice', 'surrender', 'manual',
]);

export const MUTATING_MESSAGE_TYPES = new Set([
  'create', 'join', 'spectate', 'leave', 'setMode', 'move', 'kick', 'setDeck',
  'ready', 'start', 'chat', 'rematch', 'offerContent', 'approveContent', 'rejectContent',
  ...GAME_MESSAGE_TYPES,
]);
