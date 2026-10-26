// Imports the complete Riot Data Dragon card pool for Legends of Runeterra.
// Card data is fetched at your machine and stored locally. Art stays on Riot's CDN
// and is cached on demand by the server, so this project does not redistribute art.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const BASE = 'https://dd.b.pvp.net/latest';

const SETS = [
  ['set1', 'Set1'],
  ['set2', 'Set2'],
  ['set3', 'Set3'],
  ['set4', 'Set4'],
  ['set5', 'Set5'],
  ['set6', 'Set6'],
  ['set6cde', 'Set6cde'],
  ['set7', 'Set7'],
  ['set7b', 'Set7b'],
  ['set8', 'Set8'],
  ['set9', 'Set9'],
  ['setevent', 'SetEvent'],
];

async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'nexus-forge-card-importer' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function firstAsset(card) {
  const a = card.assets?.[0] || {};
  return {
    art: a.gameAbsolutePath || null,
    fullArt: a.fullAbsolutePath || null,
  };
}

function normalize(card, setRef, setName) {
  const { art, fullArt } = firstAsset(card);
  return {
    id: card.cardCode,
    code: card.cardCode,
    name: card.name,
    cost: card.cost ?? 0,
    attack: card.attack ?? 0,
    health: card.health ?? 0,
    type: card.type || 'Unit',
    supertype: card.supertype || '',
    subtypes: card.subtypes || [],
    regions: card.regionRefs?.length ? card.regionRefs : card.regions || [],
    rarity: card.rarityRef || card.rarity || '',
    rarityName: card.rarity || '',
    keywords: card.keywordRefs || [],
    keywordNames: card.keywords || [],
    text: card.descriptionRaw || card.description || '',
    textHtml: card.description || '',
    levelup: card.levelupDescriptionRaw || card.levelupDescription || '',
    flavor: card.flavorText || '',
    artist: card.artistName || '',
    set: setRef,
    setName,
    collectible: !!card.collectible,
    spellSpeed: card.spellSpeedRef || '',
    formats: card.formatRefs || [],
    associatedCardRefs: card.associatedCardRefs || [],
    art,
    fullArt,
    source: 'riot',
    enabled: !!card.collectible,
    script: null,
    scriptStatus: 'none',
    notes: '',
  };
}

async function main() {
  await mkdir(dataDir, { recursive: true });
  console.log('Fetching globals…');
  const globals = await getJson(`${BASE}/core/en_us/data/globals-en_us.json`);
  const setNames = new Map((globals.sets || []).map((s) => [s.nameRef, s.name]));

  const cards = new Map();
  const setReports = [];
  for (const [folder, setRef] of SETS) {
    try {
      const list = await getJson(`${BASE}/${folder}/en_us/data/${folder}-en_us.json`);
      let count = 0;
      let collectible = 0;
      for (const raw of list) {
        const card = normalize(raw, setRef, setNames.get(setRef) || setRef);
        if (card.collectible) collectible++;
        const existing = cards.get(card.id);
        // Prefer collectible entries and entries that carry richer text.
        if (!existing || (!existing.collectible && card.collectible)) {
          cards.set(card.id, card);
          count++;
        }
      }
      setReports.push({ set: setRef, folder, total: list.length, collectible, imported: count });
      console.log(`  ${setRef.padEnd(8)} ${String(list.length).padStart(4)} total, ${String(collectible).padStart(4)} collectible`);
    } catch (err) {
      console.warn(`  ${setRef.padEnd(8)} skipped: ${err.message}`);
      setReports.push({ set: setRef, folder, error: err.message });
    }
  }

  const all = [...cards.values()].sort((a, b) => {
    if (a.set !== b.set) return a.set.localeCompare(b.set, undefined, { numeric: true });
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });

  const tokens = all.filter((c) => !c.collectible);
  const collectibles = all.filter((c) => c.collectible);

  const payload = {
    generatedAt: new Date().toISOString(),
    source: `${BASE} (Riot Data Dragon)`,
    version: '7.10.0',
    counts: {
      total: all.length,
      collectible: collectibles.length,
      tokens: tokens.length,
      sets: setReports.length,
    },
    sets: setReports,
    globals: {
      keywords: globals.keywords || [],
      regions: globals.regions || [],
      spellSpeeds: globals.spellSpeeds || [],
      rarities: globals.rarities || [],
      sets: globals.sets || [],
      vocabTerms: globals.vocabTerms || [],
      formats: globals.formats || [],
    },
    cards: all,
  };

  await writeFile(path.join(dataDir, 'cards.json'), JSON.stringify(payload, null, 1));
  console.log(`\nWrote ${all.length} cards (${collectibles.length} collectible, ${tokens.length} tokens) to data/cards.json`);

  // A compact file the client downloads for deck building / search.
  const compact = {
    version: payload.version,
    generatedAt: payload.generatedAt,
    cards: collectibles.map((c) => ({
      id: c.id,
      name: c.name,
      cost: c.cost,
      attack: c.attack,
      health: c.health,
      type: c.type,
      supertype: c.supertype,
      subtypes: c.subtypes,
      regions: c.regions,
      rarity: c.rarity,
      keywords: c.keywords,
      text: c.text,
      set: c.set,
      art: c.art,
      fullArt: c.fullArt,
      enabled: c.enabled,
      scriptStatus: c.scriptStatus,
    })),
  };
  await writeFile(path.join(dataDir, 'cards-compact.json'), JSON.stringify(compact));
  console.log('Wrote data/cards-compact.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
