import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { writeFile, access, mkdir } from 'node:fs/promises';
import { WebSocketServer } from 'ws';
import { Store, ROOT } from './store.js';
import { RoomManager } from './rooms.js';
import {
  validateDeck, deckFromCode, deckToCode, autoBuildDeck, normalizeCards, summarizeDeck,
} from './decks.js';
import { targetSpecsForScript } from './engine/effects.js';
import { PeerHub } from './peerhub.js';
import { dispatchClientMessage } from './dispatch.js';
import { validateScript } from './script-validation.js';
import { APP_VERSION, PROTOCOL_VERSION } from '../shared/protocol.js';
import { sanitizeContentOffer } from './content.js';

// Builds the existing HTTP/API/WebSocket application as an explicit lifecycle
// object. The Electron entry point owns this object; server/index.js remains the
// standalone development wrapper so `npm start` behavior is unchanged.
export async function createNexusService({
  dataDir,
  seedDir,
  host = process.env.HOST || '0.0.0.0',
  port = Number(process.env.PORT || 3000),
  desktop = false,
  logger = console,
  sendToRenderer = null,
} = {}) {
  const bindHost = desktop ? '127.0.0.1' : host;
  const store = await new Store({ dataDir, seedDir }).init();
  const app = express();
  app.use(express.json({ limit: '12mb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Frame-Options', 'DENY');
    res.set('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss: https:",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join('; '));
    next();
  });

function publicCard(card, { admin = false } = {}) {
  if (!card) return null;
  const view = {
    id: card.id,
    name: card.name,
    cost: card.cost,
    attack: card.attack,
    health: card.health,
    type: card.type,
    supertype: card.supertype,
    subtypes: card.subtypes,
    regions: card.regions,
    rarity: card.rarity,
    rarityName: card.rarityName,
    keywords: card.keywords,
    text: card.text,
    levelup: card.levelup,
    flavor: card.flavor,
    set: card.set,
    setName: card.setName,
    spellSpeed: card.spellSpeed,
    art: card.art,
    fullArt: card.fullArt,
    collectible: card.collectible,
    enabled: card.enabled,
    scriptStatus: card.scriptStatus,
    source: card.source,
    notes: card.notes,
    targetSpecs: card.script ? targetSpecsForScript(card.script) : [],
  };
  if (admin) {
    view.script = card.script;
    view.rawKeywords = card.rawKeywords;
    view.associatedCardRefs = card.associatedCardRefs;
    view.level2Id = card.level2Id;
    view.level2 = card.level2;
    view.createdAt = card.createdAt;
    view.updatedAt = card.updatedAt;
  }
  return view;
}

function filterCards(cards, query) {
  const q = String(query.q || query.search || '').trim().toLowerCase();
  const region = String(query.region || '').trim();
  const type = String(query.type || '').trim();
  const supertype = String(query.supertype || '').trim();
  const keyword = String(query.keyword || '').trim();
  const cost = query.cost === '' || query.cost == null ? null : Number(query.cost);
  const set = String(query.set || '').trim();
  const status = String(query.status || '').trim();
  return cards.filter((c) => {
    if (q && !(`${c.name} ${c.text} ${c.id}`.toLowerCase().includes(q))) return false;
    if (region && !(c.regions || []).includes(region)) return false;
    if (type && c.type !== type) return false;
    if (supertype && c.supertype !== supertype) return false;
    if (keyword && !(c.keywords || []).includes(keyword)) return false;
    if (cost != null && !Number.isNaN(cost) && c.cost !== cost) return false;
    if (set && c.set !== set) return false;
    if (status && c.scriptStatus !== status) return false;
    return true;
  });
}

function paginate(list, query, defaultLimit = 60) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(200, Math.max(1, Number(query.limit || defaultLimit)));
  const total = list.length;
  const start = (page - 1) * limit;
  return { items: list.slice(start, start + limit), total, page, pages: Math.max(1, Math.ceil(total / limit)), limit };
}

function adminToken(req) {
  return req.get('x-admin-token') || req.body?.token || req.query?.token || '';
}

function requireAdmin(req, res, next) {
  if (!store.verifyAdmin(adminToken(req))) return res.status(401).json({ error: 'Admin token required' });
  next();
}

function safeCode(code) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(String(code || ''));
}

function svgPlaceholder(name, region) {
  const esc = (s) => String(s || '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
  <defs><radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#2a3763"/><stop offset="1" stop-color="#070b18"/></radialGradient></defs>
  <rect width="640" height="640" fill="url(#g)"/>
  <circle cx="320" cy="276" r="150" fill="none" stroke="#d8b75b" stroke-opacity=".35" stroke-width="2"/>
  <circle cx="320" cy="276" r="118" fill="none" stroke="#d8b75b" stroke-opacity=".18" stroke-width="1"/>
  <text x="320" y="270" text-anchor="middle" font-family="Georgia,serif" font-size="30" fill="#e9dfc3">${esc(name)}</text>
  <text x="320" y="310" text-anchor="middle" font-family="Inter,sans-serif" font-size="14" fill="#8fa0c7" letter-spacing="4">${esc(region || 'RUNETERRA')}</text>
  <text x="320" y="600" text-anchor="middle" font-family="Inter,sans-serif" font-size="12" fill="#5c6c92">NEXUS FORGE</text>
</svg>`;
}

// ---------------------------------------------------------------- public API
app.get('/api/health', (req, res) => {
  const stats = store.cardDB.stats();
  res.json({
    ok: true,
    name: store.settings.gameName,
    cards: stats.total,
    enabled: stats.enabled,
    version: APP_VERSION,
    protocol: PROTOCOL_VERSION,
    desktop,
  });
});

app.get('/api/meta', (req, res) => {
  const stats = store.cardDB.stats();
  const regionNames = (store.cardDB.globals.regions || []).map((r) => r.nameRef || r.name).filter(Boolean);
  const setCodes = (store.cardDB.globals.sets || []).map((s) => ({ code: s.nameRef || s.name, name: s.name })).filter((s) => s.code);
  res.json({
    name: store.settings.gameName,
    rules: store.rules,
    stats,
    regions: regionNames,
    keywords: (store.cardDB.globals.keywords || []).map((k) => ({ name: k.name, description: k.description, nameRef: k.nameRef })),
    customKeywords: store.keywords || [],
    mechanics: store.mechanics || [],
    spellSpeeds: store.cardDB.globals.spellSpeeds || [],
    sets: setCodes,
    modes: ['1v1', '2v2'],
    appVersion: APP_VERSION,
    protocol: PROTOCOL_VERSION,
    desktop,
    contentManifest: store.contentManifest(),
  });
});

app.get('/api/cardpool', (req, res) => {
  const cards = store.cardDB.enabledCards().map((c) => publicCard(c));
  res.json({
    cards,
    total: cards.length,
    regions: (store.cardDB.globals.regions || []).map((r) => r.nameRef || r.name).filter(Boolean),
  });
});

// Local-only export used when a guest must offer custom definitions to a host.
// The client sends the selected ids and never receives anything it could not
// already author locally.
app.post('/api/content/export', (req, res) => {
  const ids = new Set((Array.isArray(req.body?.cardIds) ? req.body.cardIds : []).map(String).slice(0, 200));
  const cards = (store.transferCards || store.customCards || []).filter((card) => ids.has(card.id));
  const scripts = {};
  for (const card of cards) {
    if (store.scripts?.[card.id]) scripts[card.id] = store.scripts[card.id];
  }
  const clean = sanitizeContentOffer({ cards, scripts });
  if (!clean.ok) return res.status(400).json({ error: clean.errors.join('; '), errors: clean.errors });
  res.json({
    cards: clean.cards,
    scripts: clean.scripts,
    warnings: clean.warnings,
    manifest: store.contentManifest(),
  });
});

app.get('/api/cards', (req, res) => {
  const base = store.cardDB.collectible().filter((c) => c.enabled);
  const filtered = filterCards(base, req.query);
  const page = paginate(filtered, req.query);
  res.json({ ...page, cards: page.items.map((c) => publicCard(c)) });
});

app.get('/api/cards/:id', (req, res) => {
  const card = store.cardDB.get(req.params.id);
  if (!card || !card.enabled) return res.status(404).json({ error: 'Card not found' });
  res.json(publicCard(card));
});

// ---------------------------------------------------------------- decks
app.get('/api/decks', (req, res) => {
  res.json({
    decks: store.getDecks().map((d) => ({
      ...d,
      summary: store.deckSummary(d.cards || []),
    })),
  });
});

app.get('/api/decks/:id', (req, res) => {
  const deck = store.getDeck(req.params.id);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  res.json({ deck, summary: store.deckSummary(deck.cards) });
});

app.post('/api/decks/import', (req, res) => {
  try {
    const code = req.body?.code;
    if (!code) return res.status(400).json({ error: 'Deck code required' });
    const decoded = deckFromCode(String(code).trim(), store.cardDB);
    const validation = validateDeck(decoded.cards, store.cardDB, store.rules, decoded.regions);
    res.json({
      ...decoded,
      validation,
      summary: summarizeDeck(decoded.cards, store.cardDB),
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Invalid deck code' });
  }
});

app.post('/api/decks/auto', (req, res) => {
  try {
    const regions = Array.isArray(req.body?.regions) ? req.body.regions.slice(0, 2) : [];
    const cards = autoBuildDeck(store.cardDB, {
      regions,
      seed: Number(req.body?.seed) || Date.now(),
      rules: store.rules,
      preferredChampions: req.body?.champions || [],
    });
    const validation = validateDeck(cards, store.cardDB, store.rules, regions.length ? regions : undefined);
    res.json({ cards, validation, regions: validation.regions, summary: summarizeDeck(cards, store.cardDB), code: deckToCode(cards) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not build deck' });
  }
});

app.post('/api/decks/validate', (req, res) => {
  const cards = normalizeCards(req.body?.cards || []);
  const regions = Array.isArray(req.body?.regions) ? req.body.regions : undefined;
  const validation = validateDeck(cards, store.cardDB, store.rules, regions);
  res.json({ validation, summary: summarizeDeck(cards, store.cardDB) });
});

app.post('/api/decks', async (req, res) => {
  try {
    const cards = normalizeCards(req.body?.cards || []);
    const regions = Array.isArray(req.body?.regions) ? req.body.regions.filter((r) => r !== 'Runeterra') : undefined;
    const validation = validateDeck(cards, store.cardDB, store.rules, regions);
    if (!validation.ok) return res.status(400).json({ error: 'Deck is not legal', validation });
    const id = `deck-${crypto.randomBytes(4).toString('hex')}`;
    const deck = {
      id,
      name: String(req.body?.name || 'Untitled Deck').slice(0, 50),
      author: String(req.body?.author || 'Guest').slice(0, 30),
      regions: validation.regions,
      cards,
      code: deckToCode(cards),
      starter: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.saveDeck(deck);
    res.status(201).json({ deck, summary: summarizeDeck(cards, store.cardDB) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save deck' });
  }
});

app.put('/api/decks/:id', async (req, res) => {
  const existing = store.getDeck(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Deck not found' });
  if (existing.starter) return res.status(403).json({ error: 'Starter decks are read-only; duplicate it instead.' });
  try {
    const cards = normalizeCards(req.body?.cards || existing.cards);
    const regions = Array.isArray(req.body?.regions) ? req.body.regions.filter((r) => r !== 'Runeterra') : existing.regions;
    const validation = validateDeck(cards, store.cardDB, store.rules, regions);
    if (!validation.ok) return res.status(400).json({ error: 'Deck is not legal', validation });
    existing.name = String(req.body?.name || existing.name).slice(0, 50);
    existing.author = String(req.body?.author || existing.author || 'Guest').slice(0, 30);
    existing.cards = cards;
    existing.regions = validation.regions;
    existing.code = deckToCode(cards);
    existing.updatedAt = new Date().toISOString();
    await store.saveDeck(existing);
    res.json({ deck: existing, summary: summarizeDeck(cards, store.cardDB) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save deck' });
  }
});

app.delete('/api/decks/:id', async (req, res) => {
  const ok = await store.deleteDeck(req.params.id);
  if (!ok) return res.status(400).json({ error: 'Deck not found or protected' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- art proxy (lazy cache)
app.get('/art/:code', async (req, res) => {
  const code = String(req.params.code || '');
  if (!safeCode(code)) return res.status(400).send('Bad art code');
  const localWebp = path.join(store.artDir, `${code}.webp`);
  const localPng = path.join(store.artDir, `${code}.png`);
  try {
    await access(localWebp);
    res.set('Cache-Control', 'public, max-age=604800');
    return res.type('image/webp').sendFile(localWebp);
  } catch {}
  try {
    await access(localPng);
    res.set('Cache-Control', 'public, max-age=604800');
    return res.type('image/png').sendFile(localPng);
  } catch {}
  const card = store.cardDB.get(code) || store.cardDB.getByName(code);
  if (!card) return res.status(404).send('Unknown card art');
  const directArt = card.art && (card.art.startsWith('data:image/') || card.art.startsWith('/art/')) ? card.art : '';
  let placeholderName = card.name;
  if (directArt.startsWith('data:image/')) {
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(directArt);
    if (m) {
      const buf = Buffer.from(m[2], 'base64');
      try { await writeFile(localPng, buf); } catch {}
      res.set('Cache-Control', 'public, max-age=604800');
      return res.type(m[1]).send(buf);
    }
  }
  if (directArt.startsWith('/art/')) {
    const source = path.join(store.artDir, path.basename(directArt));
    for (const [file, type] of [[`${source}.webp`, 'image/webp'], [`${source}.png`, 'image/png']]) {
      try { await access(file); return res.type(type).sendFile(file); } catch {}
    }
  }
  const art = card.fullArt || card.art || '';
  if (/^https?:\/\//i.test(art)) {
    let fetched = null;
    for (let attempt = 0; attempt < 2 && !fetched; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const upstream = await fetch(art, { signal: controller.signal, headers: { 'User-Agent': 'NexusForge/0.1' } });
        if (upstream.ok) {
          const buf = Buffer.from(await upstream.arrayBuffer());
          if (buf.length > 1000) fetched = buf;
        }
      } catch {}
      finally { clearTimeout(timer); }
      if (!fetched && attempt === 0) await new Promise((resolve) => setTimeout(resolve, 350));
    }
    if (fetched) {
      let out = fetched;
      let type = 'image/png';
      let file = localPng;
      try {
        out = await sharp(fetched)
          .rotate()
          .resize(600, 856, { fit: 'cover', position: sharp.strategy.attention })
          .webp({ quality: 82 })
          .toBuffer();
        type = 'image/webp';
        file = localWebp;
      } catch {}
      try { await writeFile(file, out); } catch {}
      res.set('Cache-Control', 'public, max-age=604800');
      return res.type(type).send(out);
    }
  }
  res.set('Cache-Control', 'no-store');
  return res.type('image/svg+xml').send(svgPlaceholder(placeholderName, (card.regions || [])[0] || ''));
});

// ---------------------------------------------------------------- admin
app.post('/api/admin/login', (req, res) => {
  if (!store.verifyAdmin(req.body?.token)) return res.status(401).json({ error: 'Invalid admin token' });
  res.json({ ok: true, name: store.settings.gameName });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const stats = store.cardDB.stats();
  const statusCounts = {};
  let textCards = 0;
  let scriptedWithText = 0;
  for (const c of store.cardDB.collectible()) {
    statusCounts[c.scriptStatus] = (statusCounts[c.scriptStatus] || 0) + 1;
    if (c.text) {
      textCards++;
      if (c.script) scriptedWithText++;
    }
  }
  res.json({
    stats,
    statusCounts,
    textCards,
    scriptedWithText,
    coverage: textCards ? Math.round((scriptedWithText / textCards) * 1000) / 10 : 100,
    customCards: store.customCards.length,
    recentCustomCards: store.customCards.slice(-5).reverse().map((c) => ({ id: c.id, name: c.name, type: c.type, cost: c.cost })),
    scripts: Object.keys(store.scripts).length,
    decks: store.decks.length,
    settings: { ...store.settings, adminToken: store.adminToken },
  });
});

app.get('/api/admin/cards', requireAdmin, (req, res) => {
  const base = store.cardDB.all();
  const filtered = filterCards(base, req.query);
  const page = paginate(filtered, { ...req.query, limit: req.query.limit || 50 });
  res.json({ ...page, cards: page.items.map((c) => publicCard(c, { admin: true })) });
});

app.post('/api/admin/cards', requireAdmin, async (req, res) => {
  try {
    if (!req.body?.name) return res.status(400).json({ error: 'Card name is required' });
    const card = store.addCustomCard(req.body);
    await store.saveCustomCards();
    await store.refreshTransferCards();
    res.status(201).json({ card: publicCard(store.cardDB.get(card.id), { admin: true }) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not create card' });
  }
});

app.put('/api/admin/cards/:id', requireAdmin, async (req, res) => {
  const existing = store.customCards.find((c) => c.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Only custom cards can be edited this way' });
  const updated = store.updateCustomCard(req.params.id, req.body || {});
  await store.saveCustomCards();
  await store.refreshTransferCards();
  res.json({ card: publicCard(store.cardDB.get(updated.id), { admin: true }) });
});

app.delete('/api/admin/cards/:id', requireAdmin, async (req, res) => {
  const ok = store.removeCustomCard(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Custom card not found' });
  await store.saveCustomCards();
  await store.refreshTransferCards();
  res.json({ ok: true });
});

app.patch('/api/admin/cards/:id', requireAdmin, async (req, res) => {
  const card = store.cardDB.get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (typeof req.body?.enabled === 'boolean') store.setCardEnabled(card.id, req.body.enabled);
  await store.saveSettings();
  res.json({ card: publicCard(store.cardDB.get(card.id), { admin: true }) });
});

app.get('/api/admin/scripts/:id', requireAdmin, (req, res) => {
  const card = store.cardDB.get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  res.json({ card: publicCard(card, { admin: true }), entry: store.getScriptEntry(card.id) || null });
});

app.put('/api/admin/scripts/:id', requireAdmin, async (req, res) => {
  const card = store.cardDB.get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  let script = req.body?.script;
  if (typeof script === 'string') {
    try { script = script.trim() ? JSON.parse(script) : null; } catch (err) {
      return res.status(400).json({ error: `Script JSON is invalid: ${err.message}` });
    }
  }
  if (script != null) {
    const validation = validateScript(script);
    if (!validation.ok) return res.status(400).json({ error: 'Script shape is invalid', validation });
  }
  const entry = store.setScript(card.id, script, req.body?.status || (script ? 'custom' : 'none'));
  await store.saveScripts();
  res.json({ entry, card: publicCard(store.cardDB.get(card.id), { admin: true }) });
});

app.delete('/api/admin/scripts/:id', requireAdmin, async (req, res) => {
  store.setScript(req.params.id, null, 'none');
  await store.saveScripts();
  res.json({ ok: true });
});

app.post('/api/admin/scripts/validate', requireAdmin, (req, res) => {
  let script = req.body?.script;
  if (typeof script === 'string') {
    try { script = JSON.parse(script); } catch (err) { return res.json({ ok: false, errors: [`JSON: ${err.message}`], warnings: [] }); }
  }
  res.json(validateScript(script));
});

app.get('/api/admin/mechanics', requireAdmin, (req, res) => {
  res.json({ mechanics: store.mechanics || [], keywords: store.keywords || [] });
});

app.post('/api/admin/mechanics', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'Mechanic name is required.' });
  const id = String(body.id || `mech-${crypto.randomBytes(3).toString('hex')}`).trim().replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 60) || `mech-${crypto.randomBytes(3).toString('hex')}`;
  if ((store.mechanics || []).some((m) => m.id === id)) return res.status(400).json({ error: 'A mechanic with that ID already exists.' });
  const template = body.template && typeof body.template === 'object' ? body.template : { triggers: [] };
  const mechanic = { id, name, description: String(body.description || '').slice(0, 400), template, createdAt: new Date().toISOString() };
  store.mechanics = [...(store.mechanics || []), mechanic];
  await store.saveMechanics();
  store.rebuild();
  res.status(201).json({ mechanic });
});

app.put('/api/admin/mechanics/:id', requireAdmin, async (req, res) => {
  const idx = (store.mechanics || []).findIndex((m) => m.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Mechanic not found.' });
  const body = req.body || {};
  const current = store.mechanics[idx];
  store.mechanics[idx] = {
    ...current,
    name: body.name != null ? String(body.name).trim().slice(0, 60) : current.name,
    description: body.description != null ? String(body.description).slice(0, 400) : current.description,
    template: body.template && typeof body.template === 'object' ? body.template : current.template,
    updatedAt: new Date().toISOString(),
  };
  await store.saveMechanics();
  store.rebuild();
  res.json({ mechanic: store.mechanics[idx] });
});

app.delete('/api/admin/mechanics/:id', requireAdmin, async (req, res) => {
  const before = (store.mechanics || []).length;
  store.mechanics = (store.mechanics || []).filter((m) => m.id !== req.params.id);
  if (store.mechanics.length === before) return res.status(404).json({ error: 'Mechanic not found.' });
  await store.saveMechanics();
  store.rebuild();
  res.json({ ok: true });
});

app.get('/api/admin/keywords', requireAdmin, (req, res) => {
  res.json({ custom: store.keywords || [], builtin: store.cardDB.globals.keywords || [] });
});

app.post('/api/admin/keywords', requireAdmin, async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 50);
  if (!name) return res.status(400).json({ error: 'Keyword name is required.' });
  if ((store.keywords || []).some((k) => String(k.name).toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: 'That keyword already exists.' });
  }
  const keyword = { name, description: String(req.body?.description || '').slice(0, 400), createdAt: new Date().toISOString() };
  store.keywords = [...(store.keywords || []), keyword];
  await store.saveKeywords();
  store.rebuild();
  res.status(201).json({ keyword });
});

app.put('/api/admin/keywords/:name', requireAdmin, async (req, res) => {
  const idx = (store.keywords || []).findIndex((k) => String(k.name).toLowerCase() === String(req.params.name).toLowerCase());
  if (idx < 0) return res.status(404).json({ error: 'Keyword not found.' });
  const name = String(req.body?.name || store.keywords[idx].name).trim().slice(0, 50);
  store.keywords[idx] = { ...store.keywords[idx], name, description: String(req.body?.description ?? store.keywords[idx].description ?? '').slice(0, 400) };
  await store.saveKeywords();
  res.json({ keyword: store.keywords[idx] });
});

app.delete('/api/admin/keywords/:name', requireAdmin, async (req, res) => {
  const before = (store.keywords || []).length;
  store.keywords = (store.keywords || []).filter((k) => String(k.name).toLowerCase() !== String(req.params.name).toLowerCase());
  if (store.keywords.length === before) return res.status(404).json({ error: 'Keyword not found.' });
  await store.saveKeywords();
  res.json({ ok: true });
});

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json({ settings: { ...store.settings, adminToken: store.adminToken }, rules: store.rules, decks: store.decks.length });
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  const body = req.body || {};
  if (body.gameName) store.settings.gameName = String(body.gameName).slice(0, 40);
  if (body.rules && typeof body.rules === 'object') {
    const rules = store.settings.rules || {};
    for (const key of ['deckSize', 'maxCopies', 'maxRegions', 'handStart', 'handMax', 'boardMax', 'nexus1v1', 'nexus2v2', 'spellManaCap', 'maxMana']) {
      if (body.rules[key] != null) rules[key] = Number(body.rules[key]);
    }
    store.settings.rules = rules;
  }
  if (body.adminToken) {
    const token = String(body.adminToken).trim();
    if (token.length < 6) return res.status(400).json({ error: 'Admin token must be at least 6 characters.' });
    store.settings.adminToken = token;
  }
  await store.saveSettings();
  store.rebuild();
  res.json({ settings: { ...store.settings, adminToken: store.adminToken }, rules: store.rules });
});

app.post('/api/admin/pool/bulk', requireAdmin, async (req, res) => {
  const { kind, values, enabled } = req.body || {};
  if (!['set', 'region', 'rarity'].includes(kind) || !Array.isArray(values)) return res.status(400).json({ error: 'kind and values are required' });
  store.bulkSetEnabled(kind, values, !!enabled);
  await store.saveSettings();
  res.json({ ok: true, stats: store.cardDB.stats() });
});

app.post('/api/admin/art', requireAdmin, async (req, res) => {
  const dataUrl = String(req.body?.dataUrl || '');
  const m = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(dataUrl);
  if (!m) return res.status(400).json({ error: 'Upload a PNG, JPEG or WebP image.' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 8 * 1024 * 1024) return res.status(400).json({ error: 'Image too large (max 8 MB).' });
  const name = `custom-${crypto.randomBytes(5).toString('hex')}`;
  await mkdir(store.artDir, { recursive: true });
  await writeFile(path.join(store.artDir, `${name}.png`), buf);
  res.json({ ok: true, url: `/art/${name}` });
});

app.get('/api/admin/export', requireAdmin, (req, res) => {
  res.json({
    exportedAt: new Date().toISOString(),
    settings: { ...store.settings, adminToken: undefined },
    customCards: store.customCards,
    scripts: store.scripts,
    mechanics: store.mechanics,
    keywords: store.keywords,
    decks: store.decks.filter((d) => !d.starter),
  });
});

// ---------------------------------------------------------------- static client
app.use('/shared', express.static(path.join(ROOT, 'shared')));
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/art/')) return next();
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ---------------------------------------------------------------- websocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new RoomManager(store);
const peerHub = new PeerHub({ store, rooms });
if (typeof sendToRenderer === 'function') peerHub.setRendererSend(sendToRenderer);

wss.on('connection', (ws) => {
  ws.kind = 'ws';
  ws.isAlive = true;
  ws.clientId = null;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return rooms.error(ws, 'Invalid message'); }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
    if (msg.type === 'hello') {
      const id = String(msg.clientId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
      const clientId = id || `guest-${crypto.randomUUID()}`;
      rooms.attach(ws, clientId);
      ws.send(JSON.stringify({ type: 'welcome', clientId, name: store.settings.gameName, admin: false, desktop }));
      return;
    }
    if (!ws.clientId) return rooms.error(ws, 'Send hello first.');
    // Local host-only lifecycle message: the renderer asks for a new code when
    // the public PeerJS namespace already occupies the current one.
    if (msg.type === 'regenerateRoomCode') {
      rooms.regenerateRoomCode(ws);
      return;
    }
    dispatchClientMessage({ conn: ws, msg, rooms, transport: 'ws' });
  });
  ws.on('close', () => rooms.detach(ws));
  ws.on('error', () => {});
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { try { ws.terminate(); } catch {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 30000);
heartbeat.unref?.();

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

let activePort = null;
let started = false;
let stopping = null;

async function start() {
  if (started) return service;
  await new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      started = true;
      activePort = server.address().port;
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, bindHost);
  });
  return service;
}

async function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    clearInterval(heartbeat);
    // Best effort: tell connected guests why their table vanished before the
    // data channels and local server are torn down.
    rooms.closeAllRooms('host-left');
    peerHub.dispose();
    rooms.dispose();
    for (const ws of wss.clients) {
      try { ws.terminate(); } catch {}
    }
    if (started) {
      await new Promise((resolve) => {
        server.close(() => resolve());
        try { server.closeAllConnections(); } catch {}
      });
    }
    started = false;
    activePort = null;
  })().finally(() => { stopping = null; });
  return stopping;
}

const service = {
  app,
  server,
  wss,
  store,
  rooms,
  peerHub,
  desktop,
  bindHost,
  get port() { return activePort; },
  get url() { return activePort ? `http://${bindHost === '0.0.0.0' ? '127.0.0.1' : bindHost}:${activePort}` : null; },
  get started() { return started; },
  start,
  stop,
  dispose: stop,
  lanAddresses,
  // Narrow functions for Electron main. Renderer-owned PeerJS channels call
  // these; no peer can select its own identity or call arbitrary methods.
  openPeer: (payload) => peerHub.open(payload),
  messagePeer: (sessionId, data) => peerHub.message(sessionId, data),
  closePeer: (sessionId) => peerHub.close(sessionId),
};

return service;
}

export async function startNexusService(options = {}) {
  const service = await createNexusService(options);
  await service.start();
  return service;
}
