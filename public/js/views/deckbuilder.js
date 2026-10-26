import { encodeDeckCode } from '/shared/deckcode.js';
import {
  cardHtml, cardById, esc, regionLabel, regionColor, toast, openModal, modalConfirm, modalPrompt, copyText,
} from '../ui.js';
import { apiGet, apiPost, apiPut, apiDelete } from '../api.js';

const filters = { q: '', region: '', type: '', cost: '', sort: 'cost' };
let draft = null;
let poolLimit = 240;
let poolScroll = 0;
let deckScroll = 0;
let sourceStarter = false;
let draftSource = null;
let searchTimer = null;
const ALL_REGIONS = ['Demacia', 'Freljord', 'Ionia', 'Noxus', 'PiltoverZaun', 'ShadowIsles', 'Bilgewater', 'Targon', 'Shurima', 'BandleCity'];

function newDraft(state) {
  return { id: null, name: 'New Deck', author: state.playerName || 'Guest', cards: [], regions: [], code: '', starter: false };
}

function loadDraft(deck, state, { asCopy = false } = {}) {
  const cards = (deck.cards || []).map((c) => ({ cardId: c.cardId, count: c.count }));
  return {
    id: asCopy || deck.starter ? null : deck.id,
    name: asCopy || deck.starter ? `${deck.name}${deck.starter ? ' (Copy)' : ' (Edited)'}` : deck.name,
    author: deck.author || state.playerName || 'Guest',
    cards,
    regions: [...(deck.regions || [])],
    code: deck.code || '',
    starter: false,
  };
}

function ensureDraft(state) {
  const id = state.deckEditId;
  if (id) {
    const deck = (state.decks || []).find((d) => d.id === id);
    if (deck) {
      if (draftSource !== id) {
        draft = loadDraft(deck, state);
        draftSource = id;
        sourceStarter = !!deck.starter;
        if (deck.starter) { draft.id = null; draft.name = `${deck.name} (Copy)`; }
        poolLimit = 240;
      }
      return;
    }
  }
  if (!draft) {
    draft = newDraft(state);
    draftSource = null;
    sourceStarter = false;
  }
  if (!draft.author || draft.author === 'Guest') draft.author = state.playerName || 'Guest';
}

function cardRegions(card) {
  return (card?.regions || []).filter((r) => r !== 'Runeterra');
}

function deckTotal() { return draft.cards.reduce((n, c) => n + c.count, 0); }
function copyCount(cardId) { return draft.cards.find((c) => c.cardId === cardId)?.count || 0; }

function canAddCard(card, rules) {
  if (!card) return { ok: false, reason: 'Card not found.' };
  const max = rules.maxCopies ?? 3;
  if (copyCount(card.id) >= max) return { ok: false, reason: `Maximum ${max} copies of ${card.name}.` };
  if (deckTotal() >= (rules.deckSize ?? 40)) return { ok: false, reason: 'The deck already has 40 cards.' };
  const cr = cardRegions(card);
  if (!cr.length) return { ok: true };
  if (cr.some((r) => draft.regions.includes(r))) return { ok: true };
  if (draft.regions.length < (rules.maxRegions ?? 2)) return { ok: true, addRegion: cr[0] };
  return { ok: false, reason: `${card.name} needs ${cr.map(regionLabel).join(' or ')}, but the deck already uses ${draft.regions.map(regionLabel).join(' + ')}.` };
}

function addCard(card, state, root, ctx) {
  const check = canAddCard(card, state.meta?.rules || {});
  if (!check.ok) { toast(check.reason, 'error'); return; }
  if (check.addRegion && !draft.regions.includes(check.addRegion)) draft.regions = [...draft.regions, check.addRegion].slice(0, state.meta?.rules?.maxRegions ?? 2);
  const entry = draft.cards.find((c) => c.cardId === card.id);
  if (entry) entry.count++;
  else draft.cards.push({ cardId: card.id, count: 1 });
  draft.code = '';
  rerender(root, ctx);
}

function removeCard(cardId, state, root, ctx, all = false) {
  const idx = draft.cards.findIndex((c) => c.cardId === cardId);
  if (idx < 0) return;
  if (all) draft.cards.splice(idx, 1);
  else if (draft.cards[idx].count > 1) draft.cards[idx].count--;
  else draft.cards.splice(idx, 1);
  draft.code = '';
  rerender(root, ctx);
}

function localValidation(state) {
  const rules = state.meta?.rules || {};
  const maxCopies = rules.maxCopies ?? 3;
  const maxRegions = rules.maxRegions ?? 2;
  const deckSize = rules.deckSize ?? 40;
  const errors = [];
  const warnings = [];
  const total = deckTotal();
  const counts = new Map();
  for (const entry of draft.cards) {
    const card = cardById(entry.cardId);
    if (!card) { errors.push(`Unknown card: ${entry.cardId}`); continue; }
    if (entry.count > maxCopies) errors.push(`Too many copies of ${card.name} (${entry.count}/${maxCopies}).`);
    if (card.type === 'Ability' || card.type === 'Trap') errors.push(`${card.name} cannot be in a deck.`);
    if (card.enabled === false) warnings.push(`${card.name} is disabled in the current pool.`);
    counts.set(entry.cardId, (counts.get(entry.cardId) || 0) + entry.count);
  }
  for (const [id, count] of counts) if (count > maxCopies) errors.push(`Too many copies of ${cardById(id)?.name || id}.`);
  if (draft.regions.length > maxRegions) errors.push(`The deck uses ${draft.regions.length} regions; the limit is ${maxRegions}.`);
  for (const entry of draft.cards) {
    const card = cardById(entry.cardId);
    if (!card) continue;
    const cr = cardRegions(card);
    if (cr.length && !cr.some((r) => draft.regions.includes(r))) errors.push(`${card.name} doesn't belong to ${draft.regions.map(regionLabel).join(' + ')}.`);
  }
  if (total !== deckSize) errors.push(`The deck has ${total} cards; exactly ${deckSize} are required.`);
  return { ok: errors.length === 0, errors, warnings, total };
}

function curveData() {
  const curve = {};
  for (const entry of draft.cards) {
    const card = cardById(entry.cardId);
    const cost = Math.min(10, card?.cost ?? 0);
    curve[cost] = (curve[cost] || 0) + entry.count;
  }
  return curve;
}

function codeNow() {
  try { return draft.cards.length ? encodeDeckCode(draft.cards) : ''; } catch { return draft.code || ''; }
}

async function saveDeck(root, ctx) {
  const validation = localValidation(ctx.state);
  if (!validation.ok) { toast('Fix the deck rules before saving.', 'error'); return; }
  const name = String(draft.name || '').trim();
  if (!name) { toast('Give the deck a name.', 'error'); return; }
  try {
    const payload = { name, author: ctx.state.playerName || draft.author || 'Guest', cards: draft.cards, regions: draft.regions };
    let data;
    if (draft.id) data = await apiPut(`/api/decks/${draft.id}`, payload);
    else data = await apiPost('/api/decks', payload);
    draft.id = data.deck.id;
    draft.code = data.deck.code;
    draft.name = data.deck.name;
    draftSource = data.deck.id;
    sourceStarter = false;
    ctx.state.deckEditId = draft.id;
    history.replaceState(null, '', `#/deck/${draft.id}`);
    await ctx.refreshDecks();
    toast(draft.id ? 'Deck saved.' : 'Deck created.', 'success');
    renderDeckBuilder(root, ctx);
  } catch (err) {
    toast(err.message || 'Could not save the deck.', 'error');
  }
}

async function autoBuild(root, ctx) {
  const rules = ctx.state.meta?.rules || {};
  let regions = draft.regions.length ? draft.regions.slice(0, rules.maxRegions ?? 2) : ['Demacia', 'Ionia'];
  try {
    const data = await apiPost('/api/decks/auto', { regions });
    draft.cards = data.cards || [];
    draft.regions = data.validation?.regions || regions;
    draft.code = data.code || '';
    draft.id = null;
    draftSource = null;
    sourceStarter = false;
    ctx.state.deckEditId = null;
    history.replaceState(null, '', '#/decks');
    if (!draft.name || draft.name === 'New Deck') draft.name = `${regions.map(regionLabel).join(' + ')} Forge`;
    toast(`Auto-built a ${draft.cards.reduce((n, c) => n + c.count, 0)}-card deck.`, 'success');
    renderDeckBuilder(root, ctx);
  } catch (err) {
    toast(err.message || 'Could not auto-build a deck.', 'error');
  }
}

function openRegionPicker(root, ctx) {
  const max = ctx.state.meta?.rules?.maxRegions ?? 2;
  const body = `<p class="muted small">Choose up to ${max} regions. Runeterra champions are neutral and do not use a region slot.</p>
    <div class="row wrap mt">${ALL_REGIONS.map((r) => `<label class="check" style="width:46%;margin:4px 0"><input type="checkbox" value="${r}" ${draft.regions.includes(r) ? 'checked' : ''}><span class="region-dot" style="background:${regionColor(r)}"></span>${esc(regionLabel(r))}</label>`).join('')}</div>`;
  openModal({
    title: 'Deck regions',
    subtitle: `Up to ${max} regions`,
    body,
    actions: [
      { label: 'Clear', className: 'btn-ghost', onClick: () => { draft.regions = []; draft.code = ''; renderDeckBuilder(root, ctx); } },
      {
        label: 'Apply regions', className: 'btn-primary', onClick: (modal, close) => {
          const chosen = [...modal.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.value);
          if (chosen.length > max) { toast(`Choose at most ${max} regions.`, 'error'); return; }
          draft.regions = chosen;
          draft.code = '';
          close();
          renderDeckBuilder(root, ctx);
        },
      },
    ],
  });
}

function openImport(root, ctx) {
  openModal({
    title: 'Import deck code',
    subtitle: 'Paste a Runeterra deck code. Codes from the live game work as well as codes generated here.',
    body: `<div class="field"><label class="label">Deck code</label><textarea class="textarea" id="import-code" placeholder="CEBAEAIBAQTQ..."></textarea></div>
      <div id="import-result" class="mt"></div>`,
    actions: [
      { label: 'Cancel', className: 'btn-ghost' },
      {
        label: 'Import', className: 'btn-primary', close: false, onClick: async (modal, close) => {
          const code = modal.querySelector('#import-code')?.value?.trim();
          const result = modal.querySelector('#import-result');
          if (!code) { toast('Paste a deck code.', 'error'); return; }
          try {
            const data = await apiPost('/api/decks/import', { code });
            draft = {
              id: null,
              name: 'Imported Deck',
              author: ctx.state.playerName || 'Guest',
              cards: data.cards || [],
              regions: data.regions || [],
              code: data.code || code.toUpperCase(),
              starter: false,
            };
            sourceStarter = false;
            draftSource = null;
            ctx.state.deckEditId = null;
            const missing = data.missing?.length ? `<div class="notice warn mt">Missing cards in this pool: ${data.missing.map(esc).join(', ')}</div>` : '';
            const summary = `<div class="notice gold mt">${data.cards?.reduce((n, c) => n + c.count, 0) || 0} cards · ${(data.regions || []).map(regionLabel).join(' + ') || 'Neutral'}</div>`;
            if (result) result.innerHTML = summary + missing;
            setTimeout(() => { close(); renderDeckBuilder(root, ctx); }, 450);
          } catch (err) {
            if (result) result.innerHTML = `<div class="notice warn">${esc(err.message || 'Invalid deck code')}</div>`;
          }
        },
      },
    ],
  });
}

function openExport(root, ctx) {
  const code = codeNow();
  if (!code) { toast('Add cards before exporting.', 'error'); return; }
  openModal({
    title: 'Deck code',
    subtitle: 'Share this code, or paste it into the live game / another Nexus Forge table.',
    body: `<div class="field"><label class="label">Deck code</label><textarea class="textarea" id="export-code" readonly style="min-height:100px">${esc(code)}</textarea></div>
      <div class="notice mt small">${deckTotal()} cards${draft.regions.length ? ` · ${draft.regions.map(regionLabel).join(' + ')}` : ''}</div>`,
    actions: [
      { label: 'Copy code', className: 'btn-primary', close: false, onClick: async () => { await copyText(code); toast('Deck code copied.', 'success'); } },
      { label: 'Done', className: 'btn-ghost' },
    ],
  });
}

function openDeckDetails(card, root, ctx) {
  openModal({
    title: card.name,
    subtitle: `${card.type}${card.supertype ? ` · ${card.supertype}` : ''} · ${card.cost ?? 0} mana`,
    body: `<div class="card-admin-preview">
      ${cardHtml(card, { noTooltip: true })}
      <div>
        <div class="muted" style="white-space:pre-wrap;line-height:1.6">${esc(card.text || 'No card text.')}</div>
        <div class="row wrap mt">${(card.keywords || []).map((k) => `<span class="keyword">${esc(k)}</span>`).join('')}</div>
        <div class="small muted mt">${esc((card.regions || []).map(regionLabel).join(' + '))} · ${esc(card.setName || card.set || '')}</div>
      </div>
    </div>`,
    actions: [
      { label: 'Add to deck', className: 'btn-primary', onClick: () => addCard(card, ctx.state, root, ctx) },
      { label: 'Close', className: 'btn-ghost' },
    ],
  });
}

function rerender(root, ctx) {
  const active = document.activeElement;
  const activeId = active?.id;
  const start = active?.selectionStart;
  const end = active?.selectionEnd;
  poolScroll = root.querySelector('.pool-scroll')?.scrollTop || poolScroll;
  deckScroll = root.querySelector('.deck-list')?.scrollTop || deckScroll;
  renderDeckBuilder(root, ctx);
  const el = activeId ? document.getElementById(activeId) : null;
  if (el) {
    el.focus();
    try { if (start != null && el.setSelectionRange) el.setSelectionRange(start, end); } catch {}
  }
}

export function renderDeckBuilder(root, ctx) {
  const { state } = ctx;
  ensureDraft(state);
  if (!draft) draft = newDraft(state);
  const rules = state.meta?.rules || {};
  const validation = localValidation(state);
  const total = validation.total;
  const max = rules.deckSize ?? 40;
  const maxCopies = rules.maxCopies ?? 3;
  const pool = (state.pool || []).filter((c) => c.enabled !== false);
  const q = filters.q.trim().toLowerCase();
  const filtered = pool.filter((c) => {
    if (filters.region && !(c.regions || []).includes(filters.region) && !(filters.region === 'Runeterra' && !(c.regions || []).filter((r) => r !== 'Runeterra').length)) return false;
    if (filters.type === 'Champion' && c.supertype !== 'Champion') return false;
    if (filters.type && filters.type !== 'Champion' && c.type !== filters.type) return false;
    if (filters.cost === '10' ? (c.cost || 0) < 10 : filters.cost !== '' && String(c.cost ?? 0) !== filters.cost) return false;
    if (q && !`${c.name} ${c.text || ''} ${(c.keywords || []).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    if (filters.sort === 'name') return String(a.name).localeCompare(String(b.name));
    if (filters.sort === 'attack') return (b.attack || 0) - (a.attack || 0) || (a.cost || 0) - (b.cost || 0);
    if (filters.sort === 'health') return (b.health || 0) - (a.health || 0) || (a.cost || 0) - (b.cost || 0);
    return (a.cost || 0) - (b.cost || 0) || String(a.name).localeCompare(String(b.name));
  });
  const visible = filtered.slice(0, poolLimit);
  const curve = curveData();
  const maxCurve = Math.max(1, ...Object.values(curve));
  const deckGroups = {};
  for (const entry of draft.cards) {
    const card = cardById(entry.cardId);
    if (!card) continue;
    const cost = card.cost ?? 0;
    (deckGroups[cost] ||= []).push({ ...entry, card });
  }
  const deckRows = Object.keys(deckGroups).sort((a, b) => Number(a) - Number(b)).map((cost) => `
    <div class="row" style="gap:6px;margin:8px 0 3px"><span class="tiny muted2" style="letter-spacing:.12em">${cost} MANA</span><span class="tiny muted2">· ${deckGroups[cost].reduce((n, c) => n + c.count, 0)}</span><div style="flex:1;border-top:1px solid var(--line);margin-left:4px"></div></div>
    ${deckGroups[cost].sort((a, b) => String(a.card.name).localeCompare(String(b.card.name))).map((entry) => `
      <div class="deck-row" data-deck-row="${esc(entry.cardId)}">
        <span class="cost">${esc(entry.card.cost ?? 0)}</span>
        <span class="name" title="${esc(entry.card.name)}">${esc(entry.card.name)}</span>
        <span class="count">${entry.count}/${maxCopies}</span>
        <button class="remove" data-remove-one="${esc(entry.cardId)}" title="Remove one">−</button>
        <button class="remove" data-remove-all="${esc(entry.cardId)}" title="Remove all">✕</button>
      </div>`).join('')}
  `).join('');
  const regionChips = draft.regions.length
    ? draft.regions.map((r) => `<span class="region-chip"><span class="region-dot" style="background:${regionColor(r)}"></span>${esc(regionLabel(r))}</span>`).join('')
    : '<span class="tag">No regions yet — add a card or choose regions</span>';
  const errorHtml = validation.errors.length
    ? `<div class="notice warn small">${validation.errors.slice(0, 5).map(esc).join('<br>')}${validation.errors.length > 5 ? `<br>+${validation.errors.length - 5} more` : ''}</div>`
    : `<div class="notice small" style="border-color:rgba(116,214,147,.25);background:rgba(116,214,147,.07);color:#bff7cd">Deck is legal. Ready for the table.</div>`;
  const deckOptions = [
    `<option value="">＋ New deck</option>`,
    ...(state.decks || []).map((d) => `<option value="${esc(d.id)}" ${draft.id === d.id ? 'selected' : ''}>${esc(d.name)}${d.starter ? ' · starter' : ''}</option>`),
  ].join('');
  const filterRegionOptions = ['', ...ALL_REGIONS, 'Runeterra'].map((r) => `<option value="${r}" ${filters.region === r ? 'selected' : ''}>${r ? esc(regionLabel(r)) : 'All regions'}</option>`).join('');
  const filterTypeOptions = ['', 'Unit', 'Spell', 'Landmark', 'Equipment', 'Champion'].map((t) => `<option value="${t}" ${filters.type === t ? 'selected' : ''}>${t || 'All types'}</option>`).join('');
  const filterCostOptions = ['', '0', ...Array.from({ length: 10 }, (_, i) => String(i + 1)), '10'].filter((v, i, a) => a.indexOf(v) === i).map((c) => `<option value="${c}" ${filters.cost === c ? 'selected' : ''}>${c === '' ? 'Any cost' : c === '10' ? '10+' : `${c} mana`}</option>`).join('');
  const filterSortOptions = [['cost', 'Mana cost'], ['name', 'Name'], ['attack', 'Attack'], ['health', 'Health']].map(([v, l]) => `<option value="${v}" ${filters.sort === v ? 'selected' : ''}>${l}</option>`).join('');

  root.innerHTML = `
    <div class="page-title">
      <div>
        <div class="eyebrow">The workshop</div>
        <h1>Deck Builder</h1>
        <div class="muted small">${pool.length} enabled cards · 40-card decks · max ${maxCopies} copies · up to ${rules.maxRegions ?? 2} regions</div>
      </div>
      <div class="row wrap">
        <select class="select input-sm" id="deck-load" style="width:auto;min-width:190px;min-height:34px">${deckOptions}</select>
        <button class="btn btn-sm btn-ghost" id="deck-new">New</button>
        <a class="btn btn-sm btn-ghost" href="#/lobby">Lobby</a>
      </div>
    </div>

    <div class="builder-layout">
      <section class="panel">
        <div class="filters">
          <div class="field"><label class="label" for="pool-search">Search</label><input class="input input-sm" id="pool-search" value="${esc(filters.q)}" placeholder="Card name, text, keyword…"></div>
          <div class="field"><label class="label" for="filter-region">Region</label><select class="select input-sm" id="filter-region">${filterRegionOptions}</select></div>
          <div class="field"><label class="label" for="filter-type">Type</label><select class="select input-sm" id="filter-type">${filterTypeOptions}</select></div>
          <div class="field"><label class="label" for="filter-cost">Cost</label><select class="select input-sm" id="filter-cost">${filterCostOptions}</select></div>
          <div class="field"><label class="label" for="filter-sort">Sort</label><select class="select input-sm" id="filter-sort">${filterSortOptions}</select></div>
        </div>
        <div class="row between" style="padding:10px 14px 0">
          <div class="tiny muted2">${filtered.length} matching cards${filtered.length > poolLimit ? ` · showing ${poolLimit}` : ''}</div>
          <div class="row"><span class="tag gold">${total}/${max}</span>${sourceStarter ? '<span class="tag">Starter copy</span>' : ''}</div>
        </div>
        <div class="pool-scroll scroll-thin" id="pool-scroll">
          ${visible.length ? `<div class="pool-grid" id="pool-grid">${visible.map((c) => {
            const count = copyCount(c.id);
            const check = canAddCard(c, rules);
            return cardHtml(c, { compact: true, badge: count ? `×${count}` : '', badgeClass: 'auto', dim: !check.ok, attrs: `data-pool-card="${esc(c.id)}"` });
          }).join('')}</div>` : '<div class="pool-empty">No cards match those filters.</div>'}
          ${filtered.length > poolLimit ? `<div class="center mt"><button class="btn btn-ghost btn-sm" id="pool-more">Show ${Math.min(240, filtered.length - poolLimit)} more</button></div>` : ''}
        </div>
      </section>

      <aside class="deck-pane">
        <div class="panel mb">
          <div class="panel-head" style="padding:12px 14px"><h3>${draft.id ? 'Edit deck' : 'New deck'}</h3><span class="tag ${validation.ok ? 'green' : ''}">${validation.ok ? 'Legal' : 'Draft'}</span></div>
          <div class="panel-body" style="padding:12px 14px">
            <div class="field mb"><label class="label" for="deck-name">Name</label><input class="input input-sm" id="deck-name" maxlength="50" value="${esc(draft.name)}" placeholder="Deck name"></div>
            <div class="row between mb">
              <div class="deck-meta"><span class="deck-count">${total}</span><span class="tiny muted2">/ ${max} cards</span></div>
              <button class="btn btn-sm btn-ghost" id="deck-regions">Regions</button>
            </div>
            <div class="regions-selected mb">${regionChips}</div>
            <div class="curve-wrap">
              <div class="curve">${Array.from({ length: 8 }, (_, i) => {
                const v = curve[i] || 0;
                return `<div class="bar" style="height:${Math.max(4, (v / maxCurve) * 100)}%" title="${v} cards at ${i} mana"><span>${i}</span></div>`;
              }).join('')}</div>
              <div class="tiny muted2" style="margin-top:16px">Mana curve · ${curve[7] || 0} at 7+</div>
            </div>
            ${errorHtml}
            <div class="row mt" style="gap:6px">
              <button class="btn btn-primary grow" id="deck-save" ${validation.ok ? '' : 'disabled'}>${draft.id ? 'Save deck' : 'Create deck'}</button>
              <button class="btn btn-teal" id="deck-auto" title="Build a legal deck from the chosen regions">Auto-build</button>
            </div>
            <div class="row mt" style="gap:6px">
              <button class="btn btn-sm btn-ghost grow" id="deck-import">Import code</button>
              <button class="btn btn-sm btn-ghost grow" id="deck-export">Export code</button>
              <button class="btn btn-sm btn-ghost" id="deck-copy" title="Copy deck code">⧉</button>
            </div>
            ${draft.id ? `<div class="row mt"><button class="btn btn-sm btn-ghost grow" id="deck-duplicate">Duplicate</button><button class="btn btn-sm btn-danger" id="deck-delete">Delete</button></div>` : ''}
            ${sourceStarter ? '<div class="notice gold small mt">This is a read-only starter deck. Saving creates your own copy.</div>' : ''}
          </div>
        </div>

        <div class="panel">
          <div class="panel-head" style="padding:12px 14px"><h3>Cards <span class="muted tiny">${draft.cards.length} unique</span></h3><button class="btn btn-sm btn-ghost" id="deck-clear">Clear</button></div>
          <div class="deck-list scroll-thin" id="deck-list" style="max-height:46vh">
            ${draft.cards.length ? deckRows : '<div class="empty-state" style="padding:28px 10px"><div class="icon">▤</div><div class="small">Add cards from the pool.</div></div>'}
          </div>
          <div class="panel-body" style="padding:9px 14px;border-top:1px solid var(--line)">
            <div class="row between tiny muted2"><span>Author</span><span>${esc(draft.author || 'Guest')}</span></div>
          </div>
        </div>
      </aside>
    </div>
  `;

  const poolScrollEl = root.querySelector('#pool-scroll');
  if (poolScrollEl) poolScrollEl.scrollTop = poolScroll;
  const deckListEl = root.querySelector('#deck-list');
  if (deckListEl) deckListEl.scrollTop = deckScroll;

  root.querySelector('#pool-search')?.addEventListener('input', (e) => {
    filters.q = e.target.value;
    poolLimit = 240;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => rerender(root, ctx), 260);
  });
  root.querySelector('#filter-region')?.addEventListener('change', (e) => { filters.region = e.target.value; poolLimit = 240; rerender(root, ctx); });
  root.querySelector('#filter-type')?.addEventListener('change', (e) => { filters.type = e.target.value; poolLimit = 240; rerender(root, ctx); });
  root.querySelector('#filter-cost')?.addEventListener('change', (e) => { filters.cost = e.target.value; poolLimit = 240; rerender(root, ctx); });
  root.querySelector('#filter-sort')?.addEventListener('change', (e) => { filters.sort = e.target.value; rerender(root, ctx); });
  root.querySelector('#pool-more')?.addEventListener('click', () => { poolLimit += 240; rerender(root, ctx); });
  root.querySelectorAll('[data-pool-card]').forEach((el) => {
    el.addEventListener('click', () => {
      const card = cardById(el.dataset.poolCard);
      if (card) addCard(card, state, root, ctx);
    });
  });
  root.querySelectorAll('[data-remove-one]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); removeCard(el.dataset.removeOne, state, root, ctx); }));
  root.querySelectorAll('[data-remove-all]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); removeCard(el.dataset.removeAll, state, root, ctx, true); }));
  root.querySelectorAll('[data-deck-row]').forEach((el) => el.addEventListener('dblclick', () => {
    const card = cardById(el.dataset.deckRow);
    if (card) openDeckDetails(card, root, ctx);
  }));
  root.querySelector('#deck-name')?.addEventListener('input', (e) => { draft.name = e.target.value; });
  root.querySelector('#deck-name')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveDeck(root, ctx); });
  root.querySelector('#deck-regions')?.addEventListener('click', () => openRegionPicker(root, ctx));
  root.querySelector('#deck-save')?.addEventListener('click', () => saveDeck(root, ctx));
  root.querySelector('#deck-auto')?.addEventListener('click', () => autoBuild(root, ctx));
  root.querySelector('#deck-import')?.addEventListener('click', () => openImport(root, ctx));
  root.querySelector('#deck-export')?.addEventListener('click', () => openExport(root, ctx));
  root.querySelector('#deck-copy')?.addEventListener('click', async () => {
    const code = codeNow();
    if (!code) { toast('Add cards before copying a code.', 'error'); return; }
    await copyText(code);
    toast('Deck code copied.', 'success');
  });
  root.querySelector('#deck-new')?.addEventListener('click', () => {
    if (draft.cards.length && !confirm('Discard the current unsaved deck changes?')) return;
    draft = newDraft(state);
    draftSource = null;
    sourceStarter = false;
    state.deckEditId = null;
    history.replaceState(null, '', '#/decks');
    renderDeckBuilder(root, ctx);
  });
  root.querySelector('#deck-load')?.addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) {
      if (draft.cards.length && !confirm('Discard the current unsaved deck changes?')) return;
      draft = newDraft(state);
      draftSource = null;
      state.deckEditId = null;
      history.replaceState(null, '', '#/decks');
      renderDeckBuilder(root, ctx);
      return;
    }
    state.deckEditId = id;
    const deck = state.decks.find((d) => d.id === id);
    if (deck) {
      draft = loadDraft(deck, state);
      draftSource = id;
      sourceStarter = !!deck.starter;
      if (deck.starter) { draft.id = null; draft.name = `${deck.name} (Copy)`; }
      history.replaceState(null, '', `#/deck/${id}`);
    }
    renderDeckBuilder(root, ctx);
  });
  root.querySelector('#deck-delete')?.addEventListener('click', async () => {
    if (!draft.id) return;
    const ok = await modalConfirm('Delete deck?', `Delete “${draft.name}”? This cannot be undone.`, { danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await apiDelete(`/api/decks/${draft.id}`);
      await ctx.refreshDecks();
      draft = newDraft(state);
      draftSource = null;
      state.deckEditId = null;
      history.replaceState(null, '', '#/decks');
      toast('Deck deleted.', 'success');
      renderDeckBuilder(root, ctx);
    } catch (err) { toast(err.message || 'Could not delete the deck.', 'error'); }
  });
  root.querySelector('#deck-duplicate')?.addEventListener('click', () => {
    draft = { ...draft, id: null, name: `${draft.name} (Copy)`, starter: false };
    draftSource = null;
    sourceStarter = false;
    state.deckEditId = null;
    history.replaceState(null, '', '#/decks');
    toast('Copied into a new deck.', 'success');
    renderDeckBuilder(root, ctx);
  });
  root.querySelector('#deck-clear')?.addEventListener('click', async () => {
    if (!draft.cards.length) return;
    const ok = await modalConfirm('Clear deck?', 'Remove every card from this deck?', { danger: true, confirmLabel: 'Clear cards' });
    if (ok) { draft.cards = []; draft.code = ''; rerender(root, ctx); }
  });
  root.querySelectorAll('[data-deck-row]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const card = cardById(el.dataset.deckRow);
      if (card) openDeckDetails(card, root, ctx);
    });
  });
}
