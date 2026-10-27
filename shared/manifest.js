// Content compatibility helpers shared by the local API, the host, and the client.
// These are pure functions: no Node-only imports, so the browser can use them.
import { KNOWN_TRIGGERS, TRIGGER_NAMES } from './script-vocabulary.js';

export { KNOWN_TRIGGERS, TRIGGER_NAMES };

export function compareManifests(local, host) {
  const errors = [];
  const warnings = [];
  if (!host || typeof host !== 'object') {
    return { ok: false, errors: ['The host did not provide room content information.'], warnings };
  }
  if (!local || typeof local !== 'object') {
    return { ok: false, errors: ['Your local content information is unavailable.'], warnings };
  }
  if (host.protocol !== local.protocol) {
    errors.push(`Protocol mismatch: host ${host.protocol ?? '?'}, you ${local.protocol ?? '?'}. Both players need the same Nexus Forge release.`);
  }
  if (host.schema !== local.schema) {
    errors.push(`Game schema mismatch: host ${host.schema ?? '?'}, you ${local.schema ?? '?'}. Update both installations.`);
  }
  if (host.cardsHash !== local.cardsHash) {
    errors.push('Card data differs between you and the host. Update both installations before joining.');
  }
  if (host.cardsVersion !== local.cardsVersion) {
    warnings.push(`Card data version differs (host ${host.cardsVersion || '?'}, you ${local.cardsVersion || '?'}).`);
  }
  if (host.appVersion !== local.appVersion) {
    warnings.push(`App version differs (host ${host.appVersion || '?'}, you ${local.appVersion || '?'}).`);
  }
  if (host.rulesHash && local.rulesHash && host.rulesHash !== local.rulesHash) {
    warnings.push('The host uses different table rules; the host rules apply in this room.');
  }
  if (host.poolHash && local.poolHash && host.poolHash !== local.poolHash) {
    warnings.push('The host has a different enabled card pool; the host validates all decks.');
  }
  if (host.scriptsHash && local.scriptsHash && host.scriptsHash !== local.scriptsHash) {
    warnings.push('Host card scripts differ from yours. The host is authoritative for card effects.');
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function describeManifest(manifest) {
  if (!manifest) return 'Unknown content';
  return `${manifest.cardsVersion || 'cards'} · ${String(manifest.cardsHash || '').slice(0, 10)}`;
}
