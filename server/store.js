import { mkdir, readFile, writeFile, rename, access } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CardDB } from './engine/carddb.js';
import { makeStarterDecks, randomDeck, validateDeck, findDeckRegions } from './decks.js';
import { contentManifest } from './content.js';
import { MAX_CUSTOM_ART_BYTES } from '../shared/protocol.js';
import { mergeSeedScripts, DEFAULT_SEED_META } from './scripts-upgrade.js';
import { cardTextHash, prepareVerification, scriptHash } from './script-metadata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.NEXUS_DATA_DIR ? path.resolve(process.env.NEXUS_DATA_DIR) : path.join(ROOT, 'data');
export const SEED_DIR = process.env.NEXUS_SEED_DIR ? path.resolve(process.env.NEXUS_SEED_DIR) : DATA_DIR;
export const ART_DIR = path.join(DATA_DIR, 'art');

const DEFAULT_RULES = {
  deckSize: 40,
  maxCopies: 3,
  maxRegions: 2,
  maxChampions: 6,
  format: 'Eternal',
  handStart: 4,
  handMax: 10,
  boardMax: 6,
  nexus1v1: 20,
  nexus2v2: 40,
  spellManaCap: 3,
  maxMana: 10,
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, file);
}

export class Store {
  constructor({ dataDir = DATA_DIR, seedDir = SEED_DIR, artDir = null } = {}) {
    this.dataDir = path.resolve(dataDir);
    this.seedDir = path.resolve(seedDir || dataDir);
    this.artDir = artDir ? path.resolve(artDir) : path.join(this.dataDir, 'art');
    this.ready = false;
    this.cardsPayload = null;
    this.customCards = [];
    this.scripts = {};
    this.mechanics = [];
    this.keywords = [];
    this.settings = null;
    this.decks = [];
    this.cardDB = null;
    this.revision = 0;
    this._manifestRevision = -1;
    this._manifest = null;
  }

  file(name) { return path.join(this.dataDir, name); }
  seedFile(name) { return path.join(this.seedDir, name); }

  async backupScripts(raw, reason = 'upgrade') {
    const dir = path.join(this.dataDir, 'backups');
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `scripts-${reason}-${stamp}.json`);
    await writeFile(file, typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2));
    return file;
  }

  async upgradeScripts() {
    const seedScripts = await readJson(this.seedFile('scripts.json'), null);
    const seedMeta = await readJson(this.seedFile('scripts-seed.json'), DEFAULT_SEED_META);
    let userMeta = await readJson(this.file('scripts-upgrade.json'), null);
    let raw = null;
    let userFileExists = true;
    try {
      raw = await readFile(this.file('scripts.json'), 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') userFileExists = false;
      else throw err;
    }
    let userScripts = {};
    let corrupt = false;
    if (userFileExists) {
      try {
        userScripts = raw.trim() ? JSON.parse(raw) : {};
      } catch {
        corrupt = true;
        userScripts = {};
        userMeta = null;
      }
    } else {
      userMeta = null;
    }

    if (!seedScripts) {
      this.scripts = userScripts;
      this.scriptsUpgrade = null;
      return null;
    }

    const cardsById = new Map((this.cardsPayload?.cards || []).map((card) => [card.id, card]));
    const { scripts, report } = mergeSeedScripts({
      seedScripts,
      seedMeta: { ...DEFAULT_SEED_META, ...seedMeta },
      userScripts,
      userMeta,
      cardsById,
    });
    report.userFileExisted = userFileExists;
    report.corruptUserFile = corrupt;
    if (corrupt && raw != null) {
      report.backupFile = await this.backupScripts(raw, 'corrupt');
    } else if (report.changed && userFileExists && raw != null) {
      report.backupFile = await this.backupScripts(raw, 'upgrade');
    }
    this.scripts = scripts;
    this.scriptsUpgrade = report;
    if (report.changed || !userFileExists) {
      await writeJsonAtomic(this.file('scripts.json'), this.scripts);
    }
    const keepUserVersion = report.skipped === 'up-to-date-or-newer';
    await writeJsonAtomic(this.file('scripts-upgrade.json'), {
      version: keepUserVersion ? (userMeta?.version || seedMeta.version) : (seedMeta.version || DEFAULT_SEED_META.version),
      scriptsVersion: keepUserVersion ? (userMeta?.scriptsVersion ?? seedMeta.scriptsVersion ?? 0) : (seedMeta.scriptsVersion ?? DEFAULT_SEED_META.scriptsVersion),
      origin: keepUserVersion ? (userMeta?.origin || seedMeta.origin || DEFAULT_SEED_META.origin) : (seedMeta.origin || DEFAULT_SEED_META.origin),
      mergedAt: new Date().toISOString(),
      lastReport: report,
    });
    return report;
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
    await mkdir(this.artDir, { recursive: true });
    const cardsFile = await (async () => {
      const seedCards = this.seedFile('cards.json');
      try {
        await access(seedCards);
        return seedCards;
      } catch {
        return this.file('cards.json');
      }
    })();
    try {
      await access(cardsFile);
    } catch {
      throw new Error(`Card data is missing. Run "npm run import:cards" first (expected ${cardsFile}).`);
    }
    this.cardsPayload = await readJson(cardsFile, null);
    if (!this.cardsPayload?.cards?.length) throw new Error('data/cards.json is empty or invalid.');
    this.customCards = await readJson(this.file('custom-cards.json'), []);
    // scripts.json is writable (Card Forge), but starts from the packaged seed
    // and upgrades through a backed-up merge on later releases.
    await this.upgradeScripts();
    this.mechanics = await readJson(this.file('mechanics.json'), []);
    this.keywords = await readJson(this.file('keywords.json'), []);
    await this.refreshTransferCards();
    this.settings = await readJson(this.file('settings.json'), null);
    if (!this.settings) {
      this.settings = {
        gameName: 'Nexus Forge',
        adminToken: process.env.ADMIN_TOKEN || crypto.randomBytes(9).toString('hex'),
        createdAt: new Date().toISOString(),
        pool: { disabledCards: [], disabledSets: [], bannedCards: [] },
        rules: { ...DEFAULT_RULES },
      };
      await this.saveSettings();
    }
    if (!this.settings.rules) this.settings.rules = { ...DEFAULT_RULES };
    if (!this.settings.pool) this.settings.pool = { disabledCards: [], disabledSets: [], bannedCards: [] };
    if (!this.settings.adminToken) this.settings.adminToken = process.env.ADMIN_TOKEN || crypto.randomBytes(9).toString('hex');
    this.decks = await readJson(this.file('decks.json'), []);
    this.rebuild();
    if (!this.decks.length) {
      this.decks = makeStarterDecks(this.cardDB, this.settings.rules);
      await this.saveDecks();
      console.log(`Generated ${this.decks.length} starter decks.`);
    }
    this.ready = true;
    return this;
  }

  rebuild() {
    this.cardDB = new CardDB({
      riotPayload: this.cardsPayload,
      customCards: this.customCards,
      scripts: this.scripts,
      settings: this.settings,
      mechanics: this.mechanics,
    });
    this.revision++;
    this._manifestRevision = -1;
    return this.cardDB;
  }

  contentManifest() {
    if (this._manifestRevision !== this.revision || !this._manifest) {
      this._manifest = contentManifest(this);
      this._manifestRevision = this.revision;
    }
    return this._manifest;
  }

  // Uploaded art is stored as a local /art path, but peers can only render data
  // URLs from a bounded, sanitized content offer. Keep a non-persisted transfer
  // copy so room snapshots and exports carry the image without bloating JSON on
  // disk or letting a path escape the art directory.
  async inlineArt(value) {
    if (typeof value !== 'string' || !value) return null;
    if (/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(value)) {
      return Buffer.byteLength(value) <= MAX_CUSTOM_ART_BYTES ? value : null;
    }
    const match = /^\/art\/([A-Za-z0-9_-]+)$/.exec(value);
    if (!match) return null;
    const name = path.basename(match[1]);
    for (const ext of ['webp', 'png', 'jpg', 'jpeg']) {
      try {
        const data = await readFile(path.join(this.artDir, `${name}.${ext}`));
        if (data.length > MAX_CUSTOM_ART_BYTES) return null;
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext;
        return `data:image/${mime};base64,${data.toString('base64')}`;
      } catch {
        // try the next extension
      }
    }
    return null;
  }

  async refreshTransferCards() {
    this.transferCards = await Promise.all((this.customCards || []).map(async (card) => {
      const art = await this.inlineArt(card.art);
      const fullArt = await this.inlineArt(card.fullArt);
      return { ...card, art, fullArt: fullArt || art };
    }));
    return this.transferCards;
  }

  get adminToken() { return this.settings?.adminToken || ''; }
  get rules() { return this.settings?.rules || DEFAULT_RULES; }

  verifyAdmin(token) {
    if (!token || !this.adminToken) return false;
    const a = Buffer.from(String(token));
    const b = Buffer.from(String(this.adminToken));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async saveSettings() { await writeJsonAtomic(this.file('settings.json'), this.settings); }
  async saveScripts() { await writeJsonAtomic(this.file('scripts.json'), this.scripts); }
  async saveCustomCards() { await writeJsonAtomic(this.file('custom-cards.json'), this.customCards); }
  async saveMechanics() { await writeJsonAtomic(this.file('mechanics.json'), this.mechanics); }
  async saveKeywords() { await writeJsonAtomic(this.file('keywords.json'), this.keywords); }
  async saveDecks() { await writeJsonAtomic(this.file('decks.json'), this.decks); }

  async saveCardData(payload) {
    this.cardsPayload = payload;
    await writeJsonAtomic(this.file('cards.json'), payload);
    this.rebuild();
  }

  getDecks() {
    return this.decks.map((d) => ({ ...d, summary: this.deckSummary(d.cards) }));
  }

  deckSummary(cards) {
    let total = 0;
    const curve = {};
    const regionSets = [];
    for (const entry of cards || []) {
      const card = this.cardDB.get(entry.cardId || entry.id);
      if (!card) continue;
      total += entry.count;
      curve[card.cost] = (curve[card.cost] || 0) + entry.count;
      regionSets.push({ card, regions: (card.regions || []).filter((r) => r !== 'Runeterra') });
    }
    const regions = findDeckRegions(regionSets, this.rules.maxRegions || 2) || [];
    return { total, curve, regions };
  }

  getDeck(id) { return this.decks.find((d) => d.id === id) || null; }

  async saveDeck(deck) {
    const idx = this.decks.findIndex((d) => d.id === deck.id);
    if (idx >= 0) this.decks[idx] = deck; else this.decks.push(deck);
    await this.saveDecks();
    return deck;
  }

  async deleteDeck(id) {
    const deck = this.decks.find((d) => d.id === id);
    if (!deck) return false;
    if (deck.starter) return false;
    this.decks = this.decks.filter((d) => d.id !== id);
    await this.saveDecks();
    return true;
  }

  ensureValidDeck(cards, { auto = true } = {}) {
    const validation = validateDeck(cards, this.cardDB, this.rules);
    if (validation.ok) return { cards, validation };
    if (!auto) return { cards, validation };
    const built = randomDeck(this.cardDB, this.rules);
    return { cards: built.cards, validation: validateDeck(built.cards, this.cardDB, this.rules), autoBuilt: true };
  }

  // ---------------------------------------------------------------- scripts
  setScript(cardId, script, status = 'custom', metadata = {}) {
    if (!script) {
      delete this.scripts[cardId];
      this.rebuild();
      return null;
    }
    const existing = this.scripts[cardId] || null;
    const card = this.cardDB?.get(cardId)
      || (this.customCards || []).find((candidate) => candidate.id === cardId)
      || null;
    const scriptChanged = !existing || scriptHash(existing.script) !== scriptHash(script);
    const textChanged = !!existing?.verification
      && existing.verification.cardTextHash !== cardTextHash(card?.text || '');
    let nextStatus = status;
    let verification = metadata.verification ?? null;
    if (verification) {
      verification = prepareVerification(verification, card);
    } else if (existing?.verification && !scriptChanged && !textChanged && nextStatus === 'curated') {
      verification = existing.verification;
    }
    if (nextStatus === 'curated' && !verification) {
      // A curated entry without verification is not verified. Keep the script
      // but downgrade the stored status until a reviewer adds metadata.
      nextStatus = 'partial';
    }
    if (nextStatus !== 'curated') verification = null;
    const next = {
      ...(existing || {}),
      script,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };
    if (verification) next.verification = verification;
    else delete next.verification;
    const seed = metadata.seed ?? existing?.seed;
    if (seed) next.seed = seed;
    else delete next.seed;
    this.scripts[cardId] = next;
    this.rebuild();
    return this.scripts[cardId] || null;
  }

  getScriptEntry(cardId) {
    return this.scripts[cardId] || null;
  }

  // ---------------------------------------------------------------- custom cards
  addCustomCard(card) {
    const id = card.id || `C${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const base = {
      id,
      code: id,
      name: card.name || 'Untitled Card',
      cost: Number(card.cost ?? 0),
      attack: Number(card.attack ?? 0),
      health: Number(card.health ?? 0),
      type: card.type || 'Unit',
      supertype: card.supertype || '',
      subtypes: card.subtypes || [],
      regions: card.regions || ['Runeterra'],
      rarity: card.rarity || 'COMMON',
      rarityName: card.rarityName || 'Common',
      keywords: card.keywords || [],
      rawKeywords: card.rawKeywords || card.keywords || [],
      text: card.text || '',
      levelup: card.levelup || '',
      flavor: card.flavor || '',
      artist: card.artist || '',
      set: card.set || 'Custom',
      setName: card.setName || 'Custom Forge',
      collectible: true,
      spellSpeed: card.spellSpeed || '',
      formats: ['Standard', 'Eternal'],
      associatedCardRefs: card.associatedCardRefs || [],
      art: card.art || null,
      fullArt: card.fullArt || card.art || null,
      source: 'custom',
      enabled: card.enabled !== false,
      script: card.script || null,
      scriptStatus: card.script ? 'custom' : (card.text ? 'manual' : 'none'),
      notes: card.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const existing = this.customCards.findIndex((c) => c.id === id);
    if (existing >= 0) this.customCards[existing] = { ...this.customCards[existing], ...base };
    else this.customCards.push(base);
    this.rebuild();
    return base;
  }

  updateCustomCard(id, patch) {
    const idx = this.customCards.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    this.customCards[idx] = { ...this.customCards[idx], ...patch, id, updatedAt: new Date().toISOString() };
    this.rebuild();
    return this.customCards[idx];
  }

  removeCustomCard(id) {
    const before = this.customCards.length;
    this.customCards = this.customCards.filter((c) => c.id !== id);
    this.rebuild();
    return this.customCards.length !== before;
  }

  // ---------------------------------------------------------------- pool
  setCardEnabled(id, enabled) {
    const pool = this.settings.pool;
    const set = new Set(pool.disabledCards || []);
    if (enabled) set.delete(id); else set.add(id);
    pool.disabledCards = [...set];
    this.rebuild();
    return this.cardDB.get(id);
  }

  setSetEnabled(setRef, enabled) {
    const pool = this.settings.pool;
    const set = new Set(pool.disabledSets || []);
    if (enabled) set.delete(setRef); else set.add(setRef);
    pool.disabledSets = [...set];
    this.rebuild();
  }

  bulkSetEnabled(kind, values, enabled) {
    // kind: 'set' | 'region' | 'rarity'
    const set = new Set(this.settings.pool.disabledCards || []);
    for (const card of this.cardDB.collectible()) {
      const match = kind === 'set' ? values.includes(card.set)
        : kind === 'region' ? (card.regions || []).some((r) => values.includes(r))
          : kind === 'rarity' ? values.includes(card.rarity)
            : false;
      if (!match) continue;
      if (enabled) set.delete(card.id);
      else set.add(card.id);
    }
    this.settings.pool.disabledCards = [...set];
    this.rebuild();
  }

  stats() {
    return this.cardDB.stats();
  }
}

export { DEFAULT_RULES, validateDeck };
