// Validation for the declarative effect JSON accepted from Card Forge and peers.
// Nothing here executes code; the engine only interprets known action types.
import { KNOWN_TRIGGERS } from '../shared/manifest.js';
import { MAX_SCRIPT_BYTES } from '../shared/protocol.js';

export function validateScript(script, { maxBytes = MAX_SCRIPT_BYTES } = {}) {
  const errors = [];
  const warnings = [];
  if (!script || typeof script !== 'object' || Array.isArray(script)) {
    return { ok: false, errors: ['Script must be an object with a triggers array.'], warnings };
  }
  try {
    if (Buffer.byteLength(JSON.stringify(script)) > maxBytes) {
      errors.push(`Script is larger than ${Math.round(maxBytes / 1024)} KB.`);
    }
  } catch {
    errors.push('Script is not serializable JSON.');
  }
  if (!Array.isArray(script.triggers)) errors.push('script.triggers must be an array.');
  if (Array.isArray(script.triggers) && script.triggers.length > 40) errors.push('Script has too many triggers (max 40).');
  for (const [i, trigger] of (Array.isArray(script.triggers) ? script.triggers : []).entries()) {
    if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) {
      errors.push(`triggers[${i}] is not an object.`);
      continue;
    }
    if (!KNOWN_TRIGGERS.has(trigger.on)) {
      warnings.push(`triggers[${i}].on "${trigger.on}" is not a built-in event; it will never fire unless added to the engine.`);
    }
    if (!Array.isArray(trigger.actions)) errors.push(`triggers[${i}].actions must be an array.`);
    if (Array.isArray(trigger.actions) && trigger.actions.length > 40) errors.push(`triggers[${i}] has too many actions (max 40).`);
    for (const [j, action] of (Array.isArray(trigger.actions) ? trigger.actions : []).entries()) {
      if (!action || typeof action !== 'object' || Array.isArray(action)) {
        errors.push(`triggers[${i}].actions[${j}] is not an object.`);
        continue;
      }
      if (!action.type || typeof action.type !== 'string') errors.push(`triggers[${i}].actions[${j}].type is required.`);
      if (action.type && action.type.length > 40) errors.push(`triggers[${i}].actions[${j}].type is too long.`);
    }
  }
  if (script.condition && typeof script.condition !== 'object') errors.push('script.condition must be an object when present.');
  return { ok: errors.length === 0, errors, warnings };
}
