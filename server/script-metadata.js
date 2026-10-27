// Verification metadata helpers for curated card scripts.
//
// A curated entry is only "verified" when all of these are true:
//   - status is `curated`
//   - verification.version is the supported schema version
//   - verification.test names a real regression test
//   - verification.cardTextHash matches the current normalized card text
//
// The hash intentionally ignores line-ending and insignificant horizontal
// whitespace changes so a formatting-only data update does not invalidate a
// script. Any real wording change does.
import crypto from 'node:crypto';
import { VERIFICATION_VERSION } from '../shared/script-vocabulary.js';
import { hashJson } from './content.js';

const HASH_RE = /^[a-f0-9]{64}$/;

export function normalizeCardText(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

export function cardTextHash(text) {
  return crypto.createHash('sha256').update(normalizeCardText(text), 'utf8').digest('hex');
}

export function scriptHash(script) {
  return hashJson(script ?? null);
}

export function validateVerification(verification, { card } = {}) {
  const errors = [];
  const warnings = [];
  if (!verification || typeof verification !== 'object' || Array.isArray(verification)) {
    return { ok: false, errors: ['verification must be an object.'], warnings };
  }
  if (verification.version !== VERIFICATION_VERSION) {
    errors.push(`verification.version must be ${VERIFICATION_VERSION}.`);
  }
  if (!HASH_RE.test(String(verification.cardTextHash || ''))) {
    errors.push('verification.cardTextHash must be a lowercase SHA-256 hex digest.');
  } else if (card && verification.cardTextHash !== cardTextHash(card.text)) {
    errors.push('verification.cardTextHash does not match the current card text.');
  }
  if (!String(verification.test || '').trim()) {
    errors.push('verification.test is required.');
  } else if (!/^test\/[\w./-]+(?:#[\w.-]+)?$/.test(String(verification.test).trim())) {
    errors.push('verification.test must look like test/file.test.mjs#case-name.');
  }
  if (verification.verifiedAt && Number.isNaN(Date.parse(verification.verifiedAt))) {
    errors.push('verification.verifiedAt must be an ISO date when present.');
  }
  if (verification.verifiedBy != null && typeof verification.verifiedBy !== 'string') {
    errors.push('verification.verifiedBy must be a string when present.');
  }
  if (verification.clauses != null) {
    if (!Array.isArray(verification.clauses) || verification.clauses.some((clause) => typeof clause !== 'string')) {
      errors.push('verification.clauses must be an array of strings when present.');
    } else if (!verification.clauses.length) {
      warnings.push('verification.clauses is empty; list at least one printed clause.');
    }
  }
  if (verification.notes != null && typeof verification.notes !== 'string') {
    errors.push('verification.notes must be a string when present.');
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function prepareVerification(input, card) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const verification = {
    version: input.version ?? VERIFICATION_VERSION,
    cardTextHash: input.cardTextHash || cardTextHash(card?.text || ''),
    verifiedAt: input.verifiedAt || new Date().toISOString(),
    verifiedBy: input.verifiedBy || 'admin',
    test: String(input.test || '').trim(),
    clauses: Array.isArray(input.clauses) ? input.clauses.map((clause) => String(clause)) : [],
    notes: String(input.notes || ''),
  };
  return verification;
}

export function verificationState(entry, card) {
  if (!entry || entry.status !== 'curated') return 'not-curated';
  if (!entry.verification) return 'missing';
  const validation = validateVerification(entry.verification);
  if (!validation.ok) return 'invalid';
  if (card && entry.verification.cardTextHash !== cardTextHash(card.text)) return 'stale';
  return 'verified';
}

export function isVerified(entry, card) {
  return verificationState(entry, card) === 'verified';
}

export function verificationSummary(entry, card) {
  const state = verificationState(entry, card);
  return {
    state,
    verified: state === 'verified',
    test: entry?.verification?.test || null,
    cardTextHash: entry?.verification?.cardTextHash || null,
  };
}
