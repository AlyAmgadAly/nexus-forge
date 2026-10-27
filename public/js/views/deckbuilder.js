import { encodeDeckCode } from '/shared/deckcode.js';
import { DeckValidator, cardLegalInFormat } from '/shared/deck-validator.js';
import {
  cardHtml, cardById, esc, regionLabel, regionColor, toast, openModal, modalConfirm, modalPrompt, copyText,
} from '../ui.js';
import { apiGet, apiPost, apiPut, apiDelete } from '../api.js';
import { collectionCardFace, renderCollectionMarkup } from './collection-ui.js';
import { icon } from './home.js';

const filters = { q: '', region: '', type: '', rarity: '', cost: '', set: '', sort: 'champions', format: 'eternal', scope: 'all' };
let filtersOpen = false;
let filterMenu = '';
let draft = null;
let poolLimit = 48;
let poolScroll = 0;
let deckScroll = 0;
let sourceStarter = false;
let draftSource = null;
let searchTimer = null;
let deckToolsOpen = false;
let deckCurveOpen = false;
const ALL_REGIONS = ['Demacia', 'Freljord', 'Ionia', 'Noxus', 'PiltoverZaun', 'ShadowIsles', 'Bilgewater', 'Targon', 'Shurima', 'BandleCity'];

function newDraft(state) {
  return { id: null, name: 'New Deck', author: state.playerName || 'Guest', cards: [], regions: [], code: '', format: 'Eternal', starter: false };
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
    format: deck.format || 'Eternal',
    starter: false,
  };
}

function ensureDraft(state) {
  const id = state.deckEditId;
  if (id === 'new') {
    if (draftSource !== 'new') {
      draft = newDraft(state);
      draftSource = 'new';
      sourceStarter = false;
    }
    return;
  }
  if (id) {
    const deck = (state.decks || []).find((d) => d.id === id);
    if (deck) {
      if (draftSource !== id) {
        draft = loadDraft(deck, state);
        draftSource = id;
        sourceStarter = !!deck.starter;
        if (deck.starter) { draft.id = null; draft.name = `${deck.name} (Copy)`; }
        poolLimit = 48;
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

function deckTotal() { return draft.cards.reduce((n, c) => n + c.count, 0); }
function copyCount(cardId) { return draft.cards.find((c) => c.cardId === cardId)?.count || 0; }

function canAddCard(card, rules) {
  if (!card) return { ok: false, reason: 'Card not found.' };
  return new DeckValidator({ get: cardById }, { rules, format: draft.format }).validateAddition(draft.cards, card.id, {
    regions: draft.regions,
  });
}

function addCard(card, state, root, ctx) {
  const check = canAddCard(card, state.meta?.rules || {});
  if (!check.ok) { toast(check.reason, 'error'); return; }
  draft.cards = check.cards;
  draft.regions = check.regions;
  draft.code = '';
  rerender(root, ctx);
}

function removeCard(cardId, state, root, ctx, all = false) {
  const idx = draft.cards.findIndex((c) => c.cardId === cardId);
  if (idx < 0) return;
  if (all) draft.cards.splice(idx, 1);
  else if (draft.cards[idx].count > 1) draft.cards[idx].count--;
  else draft.cards.splice(idx, 1);
  const validation = new DeckValidator({ get: cardById }, {
    rules: state.meta?.rules || {}, format: draft.format,
  }).validate(draft.cards);
  draft.regions = validation.regions;
  draft.code = '';
  rerender(root, ctx);
}

function localValidation(state) {
  return new DeckValidator({ get: cardById }, {
    rules: state.meta?.rules || {}, format: draft.format,
  }).validate(draft.cards, { regions: draft.regions });
}

function curveData() {
  const curve = {};
  for (const entry of draft.cards) {
    const card = cardById(entry.cardId);
    const cost = Math.min(7, card?.cost ?? 0);
    curve[cost] = (curve[cost] || 0) + entry.count;
  }
  return curve;
}

function codeNow() {
  try { return draft.cards.length ? encodeDeckCode(draft.cards) : ''; } catch { return draft.code || ''; }
}

async function saveDeck(root, ctx) {
  const name = String(draft.name || '').trim();
  if (!name) { toast('Give the deck a name.', 'error'); return false; }
  try {
    const payload = { name, author: ctx.state.playerName || draft.author || 'Guest', cards: draft.cards, regions: draft.regions, format: draft.format };
    let data;
    if (draft.id) data = await apiPut(`/api/decks/${draft.id}`, payload);
    else data = await apiPost('/api/decks', payload);
    draft.id = data.deck.id;
    draft.code = data.deck.code;
    draft.name = data.deck.name;
    draftSource = data.deck.id;
    sourceStarter = false;
    ctx.state.deckEditId = draft.id;
    if (ctx.state.deckEditorReturn) ctx.state.deckEditorReturn.deckId = draft.id;
    history.replaceState(null, '', `#/deck/${draft.id}`);
    await ctx.refreshDecks();
    toast(draft.id ? 'Deck saved.' : 'Deck created.', 'success');
    renderDeckBuilder(root, ctx);
    return true;
  } catch (err) {
    toast(err.message || 'Could not save the deck.', 'error');
    return false;
  }
}

async function autoBuild(root, ctx) {
  const rules = ctx.state.meta?.rules || {};
  let regions = draft.regions.length ? draft.regions.slice(0, rules.maxRegions ?? 2) : ['Demacia', 'Ionia'];
  try {
    const data = await apiPost('/api/decks/auto', { regions, format: draft.format });
    draft.cards = data.cards || [];
    draft.regions = data.validation?.regions || regions;
    draft.code = data.code || '';
    draft.format = data.format || draft.format;
    draft.id = null;
    draftSource = 'new';
    sourceStarter = false;
    ctx.state.deckEditId = 'new';
    if (ctx.state.deckEditorReturn) ctx.state.deckEditorReturn.deckId = 'new';
    history.replaceState(null, '', '#/deck/new');
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
            const data = await apiPost('/api/decks/import', { code, format: draft.format });
            draft = {
              id: null,
              name: 'Imported Deck',
              author: ctx.state.playerName || 'Guest',
              cards: data.cards || [],
              regions: data.regions || [],
              code: data.code || code.toUpperCase(),
              format: data.format || draft.format,
              starter: false,
            };
            sourceStarter = false;
            draftSource = 'new';
            ctx.state.deckEditId = 'new';
            if (ctx.state.deckEditorReturn) ctx.state.deckEditorReturn.deckId = 'new';
            history.replaceState(null, '', '#/deck/new');
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
      { label: 'Add to deck', className: 'btn-primary', onClick: () => {
        if (!canAddCard(card, ctx.state.meta?.rules || {}).ok) { addCard(card, ctx.state, root, ctx); return; }
        if (!location.hash.startsWith('#/deck/')) {
          ctx.state.deckEditId = draftSource || 'new';
          draftSource = ctx.state.deckEditId;
          history.replaceState(null, '', `#/deck/${ctx.state.deckEditId}`);
        }
        addCard(card, ctx.state, root, ctx);
      } },
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

function bindCardPreviews(root) {
  const preview = root.querySelector('#deck-hover-preview');
  if (!preview) return;
  let anchor = null;
  const hide = () => {
    anchor?.removeAttribute('aria-describedby');
    anchor = null;
    preview.hidden = true;
    preview.setAttribute('aria-hidden', 'true');
  };
  const show = (button) => {
    const card = cardById(button.dataset.deckRow || button.dataset.poolCard);
    if (!card) return;
    hide();
    anchor = button;
    preview.innerHTML = collectionCardFace(card, { lazy: false });
    preview.classList.remove('is-loaded');
    const img = preview.querySelector('img');
    if (img) {
      const loaded = () => { if (img.naturalWidth) preview.classList.add('is-loaded'); };
      if (img.complete) loaded();
      else img.addEventListener('load', loaded, { once: true });
    }
    preview.hidden = false;
    preview.setAttribute('aria-hidden', 'false');
    button.setAttribute('aria-describedby', preview.id);
    const rect = button.getBoundingClientRect();
    const size = preview.getBoundingClientRect();
    const pane = root.querySelector('.builder-deck-pane').getBoundingClientRect();
    let left = button.dataset.deckRow ? pane.right - 60 : rect.right + 12;
    if (left + size.width > innerWidth - 12) left = rect.left - size.width - 12;
    preview.style.left = `${Math.max(12, Math.min(left, innerWidth - size.width - 12))}px`;
    preview.style.top = `${Math.max(12, Math.min(rect.top + rect.height / 2 - size.height / 2, innerHeight - size.height - 12))}px`;
  };
  root.querySelectorAll('[data-deck-row], [data-pool-card]').forEach(button => {
    button.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') show(button); });
    button.addEventListener('pointerleave', hide);
    button.addEventListener('focus', () => show(button));
    button.addEventListener('blur', hide);
  });
  root.querySelector('.collection-shell').addEventListener('scroll', hide, true);
  root.querySelector('.collection-shell').addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
}

export function renderDeckBuilder(root, ctx) {
  const { state } = ctx;
  ensureDraft(state);
  if (!draft) draft = newDraft(state);
  const editing = location.hash.startsWith('#/deck/');
  if (!editing) state.deckEditorReturn = null;
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
    if (filters.cost === '8' ? (c.cost || 0) < 8 : filters.cost !== '' && String(c.cost ?? 0) !== filters.cost) return false;
    if (filters.rarity && c.rarity !== filters.rarity) return false;
    if (filters.set && c.set !== filters.set) return false;
    if (filters.format === 'standard' && !cardLegalInFormat(c, 'Standard')) return false;
    if (filters.scope === 'in' && !copyCount(c.id)) return false;
    if (filters.scope === 'out' && copyCount(c.id)) return false;
    if (q && !`${c.name} ${c.text || ''} ${(c.keywords || []).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    if (filters.sort === 'champions') {
      const championOrder = Number(b.supertype === 'Champion') - Number(a.supertype === 'Champion');
      if (championOrder) return championOrder;
    }
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
    const card = cardById(entry.cardId) || { id: entry.cardId, name: `Missing card: ${entry.cardId}`, cost: 0, missing: true };
    const cost = card.cost ?? 0;
    (deckGroups[cost] ||= []).push({ ...entry, card });
  }
  const deckRows = Object.keys(deckGroups).sort((a, b) => Number(a) - Number(b)).map((cost) => `
    ${deckGroups[cost].sort((a, b) => String(a.card.name).localeCompare(String(b.card.name))).map((entry) => `
      <button class="builder-deck-row" id="deck-card-${esc(entry.cardId)}" data-deck-row="${esc(entry.cardId)}" data-card-type="${entry.card.supertype === 'Champion' ? 'champion' : entry.card.type === 'Spell' ? 'spell' : 'unit'}" data-rarity="${esc(entry.card.rarity || '')}" aria-label="Remove one ${esc(entry.card.name)}, ${entry.count} in deck">
        ${entry.card.missing ? '<span class="builder-row-art" aria-hidden="true"></span>' : `<img class="builder-row-art" src="/art/${encodeURIComponent(entry.cardId)}" alt="" loading="lazy" draggable="false">`}
        <span class="builder-row-cost">${esc(entry.card.cost ?? 0)}</span>
        <span class="builder-row-name">${esc(entry.card.name)}</span>
        <span class="builder-row-count">${entry.count}</span>
      </button>`).join('')}
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
  const returnRoute = state.deckEditorReturn?.deckId === state.deckEditId ? state.deckEditorReturn.route : '#/collection/decks';
  const champions = draft.cards.reduce((count, entry) => count + (cardById(entry.cardId)?.supertype === 'Champion' ? entry.count : 0), 0);
  const deckPane = `<aside class="builder-deck-pane" aria-label="Deck editor" ${filtersOpen ? 'inert' : ''}>
    <header class="builder-deck-header">
      <button id="deck-tools-toggle" class="builder-icon-button" aria-label="Deck tools" aria-expanded="${deckToolsOpen}" aria-controls="deck-tools">${icon('cards')}</button>
      <label class="home-sr-only" for="deck-name">Deck name</label><input id="deck-name" maxlength="50" value="${esc(draft.name)}" placeholder="Deck name">
      <button id="deck-curve-toggle" class="builder-icon-button" aria-label="Mana curve and deck rules" aria-expanded="${deckCurveOpen}" aria-controls="deck-curve"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 32V19M15 32V8M24 32V15M33 32V24"/></svg></button>
    </header>
    <div class="builder-deck-tools" id="deck-tools" role="group" aria-label="Deck tools" ${deckToolsOpen ? '' : 'hidden'}>
      <label for="deck-load">Load deck</label><select class="select input-sm" id="deck-load">${deckOptions}</select>
      <div class="row wrap"><button class="btn btn-sm" id="deck-new">New deck</button><button class="btn btn-sm" id="deck-auto">Auto-build</button><button class="btn btn-sm" id="deck-clear">Clear cards</button></div>
      <div class="row wrap"><button class="btn btn-sm" id="deck-import">Import code</button><button class="btn btn-sm" id="deck-export">Export code</button><button class="btn btn-sm" id="deck-copy">Copy code</button></div>
      <button class="btn btn-primary" id="deck-save">${draft.id ? 'Save deck' : 'Create deck'}</button>
      ${draft.id ? '<div class="row wrap"><button class="btn btn-sm" id="deck-duplicate">Duplicate</button><button class="btn btn-sm btn-danger" id="deck-delete">Delete</button></div>' : ''}
      ${sourceStarter ? '<p class="small">Saving creates your own copy of this starter deck.</p>' : ''}
      <p class="small muted">Author: ${esc(draft.author || 'Guest')}</p>
    </div>
    <div class="builder-deck-tools" id="deck-curve" role="group" aria-label="Mana curve and deck rules" ${deckCurveOpen ? '' : 'hidden'}>
      <div class="regions-selected">${regionChips}</div>
      <div class="curve-wrap"><div class="curve">${Array.from({ length: 8 }, (_, i) => `<div class="bar" style="height:${Math.max(4, ((curve[i] || 0) / maxCurve) * 100)}%" title="${curve[i] || 0} cards at ${i === 7 ? '7+' : i} mana"><span>${i === 7 ? '7+' : i}</span></div>`).join('')}</div></div>
      ${errorHtml}
    </div>
    <div class="deck-list builder-deck-list" id="deck-list" aria-label="Cards in deck">
      ${draft.cards.length ? deckRows : '<div class="builder-deck-empty">Choose cards from the library.<small>Click a card here to remove one copy.</small></div>'}
    </div>
    <footer class="builder-deck-footer">
      <div class="builder-finish-actions"><button id="deck-done" class="builder-done" ${validation.ok ? '' : 'disabled'} aria-describedby="deck-validation">Done</button><a id="deck-exit" href="${returnRoute}">Back</a></div>
      <p id="deck-validation" class="builder-validation" role="status">${esc(validation.ok ? sourceStarter ? 'Ready to save as your own deck.' : 'Ready to play.' : validation.errors[0])}</p>
      <div class="builder-deck-stats">
        <div><span class="builder-stat-icon" aria-hidden="true">♛</span><strong>${champions}</strong><small>Champions</small></div>
        <div aria-label="${total} of ${max} cards"><span class="builder-stat-icon" aria-hidden="true">▱</span><strong id="deck-total">${total} / ${max}</strong><small>Cards</small></div>
        <button id="deck-regions" aria-label="Choose deck regions"><span class="builder-stat-regions">${draft.regions.slice(0, 2).map(r => `<img src="/assets/regions/${encodeURIComponent(r)}.png" alt="${esc(regionLabel(r))}">`).join('') || '<span aria-hidden="true">R</span>'}</span><strong>${draft.regions.length} / ${rules.maxRegions ?? 2}</strong><small>Regions</small></button>
      </div>
    </footer>
  </aside>`;
  const sets = [...new Map(pool.map(card => [card.set, card.setName || card.set])).entries()].filter(([id]) => id).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  root.classList.add('collection-view');
  root.innerHTML = renderCollectionMarkup({ state, filters, editing, filtersOpen, menu: filterMenu, visible, filteredCount: filtered.length, poolLimit, maxCopies, countFor: copyCount, checkFor: card => canAddCard(card, rules), deckPane, sets });

  const poolScrollEl = root.querySelector('#pool-scroll');
  if (poolScrollEl) poolScrollEl.scrollTop = poolScroll;
  const deckListEl = root.querySelector('#deck-list');
  if (deckListEl) deckListEl.scrollTop = deckScroll;

  root.querySelector('#pool-search')?.addEventListener('input', (e) => {
    filters.q = e.target.value;
    poolLimit = 48;
    poolScroll = 0;
    if (poolScrollEl) poolScrollEl.scrollTop = 0;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { if (root.querySelector('.collection-shell')) rerender(root, ctx); }, 200);
  });
  const refreshFilters = () => {
    poolLimit = 48; poolScroll = 0;
    if (poolScrollEl) poolScrollEl.scrollTop = 0;
    rerender(root, ctx);
  };
  const clearFilters = () => {
    Object.assign(filters, { q: '', region: '', type: '', rarity: '', cost: '', set: '', sort: 'champions', format: 'eternal', scope: 'all' });
    filterMenu = ''; refreshFilters();
  };
  root.querySelector('#collection-filters')?.addEventListener('click', () => {
    filtersOpen = !filtersOpen; filterMenu = ''; rerender(root, ctx);
    root.querySelector(filtersOpen ? '#filters-close' : '#collection-filters')?.focus();
  });
  root.querySelector('#filters-close')?.addEventListener('click', () => { filtersOpen = false; rerender(root, ctx); root.querySelector('#collection-filters')?.focus(); });
  ['scope', 'regions', 'format'].forEach(menu => root.querySelector(`#collection-${menu}`)?.addEventListener('click', () => {
    filterMenu = filterMenu === menu ? '' : menu; rerender(root, ctx);
  }));
  root.querySelectorAll('[data-menu-value]').forEach(button => button.addEventListener('click', () => {
    const trigger = `#collection-${filterMenu}`;
    filters[filterMenu === 'regions' ? 'region' : filterMenu] = button.dataset.menuValue;
    filterMenu = ''; refreshFilters(); root.querySelector(trigger)?.focus();
  }));
  root.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.filter;
    filters[key] = filters[key] === button.dataset.value ? '' : button.dataset.value;
    refreshFilters();
    root.querySelector(`[data-filter="${key}"][data-value="${button.dataset.value}"]`)?.focus();
  }));
  ['#filters-reset', '#collection-clear', '#collection-empty-clear'].forEach(selector => root.querySelector(selector)?.addEventListener('click', clearFilters));
  root.querySelector('#filter-set')?.addEventListener('change', e => { filters.set = e.target.value; refreshFilters(); });
  root.querySelector('.collection-shell')?.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || (!filterMenu && !filtersOpen)) return;
    const trigger = filterMenu ? `#collection-${filterMenu}` : '#collection-filters';
    filterMenu = ''; filtersOpen = false; rerender(root, ctx); root.querySelector(trigger)?.focus();
  });
  root.querySelector('.collection-shell')?.addEventListener('click', event => {
    if (filterMenu && !event.target.closest('.collection-menu, .collection-toolbar-button')) { filterMenu = ''; rerender(root, ctx); }
  });
  root.querySelector('#filter-sort')?.addEventListener('change', (e) => { filters.sort = e.target.value; rerender(root, ctx); });
  root.querySelector('#pool-more')?.addEventListener('click', () => { poolLimit += 48; rerender(root, ctx); });
  root.querySelectorAll('[data-pool-card]').forEach((el) => {
    el.addEventListener('click', () => {
      const card = cardById(el.dataset.poolCard);
      if (card) {
        if (editing) addCard(card, state, root, ctx);
        else openDeckDetails(card, root, ctx);
      }
    });
  });
  root.querySelectorAll('[data-inspect-card]').forEach(button => button.addEventListener('click', () => {
    const card = cardById(button.dataset.inspectCard);
    if (card) openDeckDetails(card, root, ctx);
  }));
  root.querySelectorAll('.collection-card-face > img').forEach(img => {
    const loaded = () => { if (img.naturalWidth) img.parentElement.classList.add('is-loaded'); };
    if (img.complete) loaded();
    else img.addEventListener('load', loaded, { once: true });
  });
  root.querySelectorAll('[data-deck-row]').forEach((el, index) => el.addEventListener('click', (event) => {
    removeCard(el.dataset.deckRow, state, root, ctx);
    if (event.detail === 0) {
      const rows = [...root.querySelectorAll('[data-deck-row]')];
      (document.getElementById(el.id) || rows[Math.min(index, rows.length - 1)] || root.querySelector('#deck-name'))?.focus({ preventScroll: true });
    }
  }));
  root.querySelector('#deck-name')?.addEventListener('input', (e) => { draft.name = e.target.value; });
  root.querySelector('#deck-name')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveDeck(root, ctx); });
  root.querySelector('#deck-regions')?.addEventListener('click', () => openRegionPicker(root, ctx));
  root.querySelector('#deck-save')?.addEventListener('click', () => saveDeck(root, ctx));
  root.querySelector('#deck-done')?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    if (await saveDeck(root, ctx)) {
      state.deckSelectionId = draft.id;
      state.deckEditorReturn = null;
      deckToolsOpen = false; deckCurveOpen = false;
      ctx.navigate(returnRoute);
    } else root.querySelector('#deck-done')?.removeAttribute('disabled');
  });
  root.querySelector('#deck-exit')?.addEventListener('click', () => { state.deckEditorReturn = null; });
  const updatePanels = () => {
    if (!editing || !root.querySelector('#deck-tools')) return;
    root.querySelector('#deck-tools').hidden = !deckToolsOpen;
    root.querySelector('#deck-curve').hidden = !deckCurveOpen;
    root.querySelector('#deck-tools-toggle').setAttribute('aria-expanded', String(deckToolsOpen));
    root.querySelector('#deck-curve-toggle').setAttribute('aria-expanded', String(deckCurveOpen));
  };
  root.querySelector('#deck-tools-toggle')?.addEventListener('click', () => { deckToolsOpen = !deckToolsOpen; deckCurveOpen = false; updatePanels(); });
  root.querySelector('#deck-curve-toggle')?.addEventListener('click', () => { deckCurveOpen = !deckCurveOpen; deckToolsOpen = false; updatePanels(); });
  root.querySelector('.collection-shell').addEventListener('keydown', event => {
    if (!editing || event.key !== 'Escape' || (!deckToolsOpen && !deckCurveOpen)) return;
    const trigger = deckToolsOpen ? '#deck-tools-toggle' : '#deck-curve-toggle';
    deckToolsOpen = false; deckCurveOpen = false; updatePanels(); root.querySelector(trigger)?.focus();
  });
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
    draftSource = 'new';
    sourceStarter = false;
    state.deckEditId = 'new';
    state.deckEditorReturn = null;
    history.replaceState(null, '', '#/deck/new');
    renderDeckBuilder(root, ctx);
  });
  root.querySelector('#deck-load')?.addEventListener('change', (e) => {
    state.deckEditorReturn = null;
    const id = e.target.value;
    if (!id) {
      if (draft.cards.length && !confirm('Discard the current unsaved deck changes?')) return;
      draft = newDraft(state);
      draftSource = 'new';
      sourceStarter = false;
      state.deckEditId = 'new';
      history.replaceState(null, '', '#/deck/new');
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
    draftSource = 'new';
    sourceStarter = false;
    state.deckEditId = 'new';
    if (state.deckEditorReturn) state.deckEditorReturn.deckId = 'new';
    history.replaceState(null, '', '#/deck/new');
    toast('Copied into a new deck.', 'success');
    renderDeckBuilder(root, ctx);
  });
  root.querySelector('#deck-clear')?.addEventListener('click', async () => {
    if (!draft.cards.length) return;
    const ok = await modalConfirm('Clear deck?', 'Remove every card from this deck?', { danger: true, confirmLabel: 'Clear cards' });
    if (ok) { draft.cards = []; draft.code = ''; rerender(root, ctx); }
  });
  bindCardPreviews(root);
}
