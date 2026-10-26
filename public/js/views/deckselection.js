import { cardById, esc, regionLabel } from '../ui.js';
import { icon } from './home.js';
import { collectionNavigation } from './collection-ui.js';

const FAVORITES_KEY = 'nf.deckFavorites';
let selection = { room: undefined, id: '', open: false, query: '', scroll: 0 };

function favorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []);
  } catch { return new Set(); }
}

function describeDeck(deck) {
  const entries = (deck.cards || []).map((entry) => ({
    card: cardById(entry.cardId || entry.id), count: Number(entry.count || 0),
  }));
  const champions = entries.filter(({ card }) => card?.supertype === 'Champion');
  // Prefer a champion belonging to the deck's regions over a neutral champion.
  const regions = deck.summary?.regions || deck.regions || [];
  const cover = champions.find(({ card }) => card.regions?.some((r) => regions.includes(r)))?.card
    || champions[0]?.card || entries.find(({ card }) => card?.type === 'Unit')?.card
    || entries.find(({ card }) => card)?.card;
  return { ...deck, regions, entries, champions, cover, total: entries.reduce((sum, e) => sum + e.count, 0) };
}

function badges(regions) {
  return (regions.length ? regions : ['Runeterra']).slice(0, 2).map((region) => {
    const supported = /^(Demacia|Noxus|Ionia|Freljord|PiltoverZaun|ShadowIsles|Bilgewater|Targon|Shurima|BandleCity|Runeterra)$/.test(region);
    return `<span class="deck-region" role="img" aria-label="${esc(regionLabel(region))}" title="${esc(regionLabel(region))}">${supported
      ? `<img src="/assets/regions/${region}.png" alt="" draggable="false">` : '<span aria-hidden="true">✦</span>'}</span>`;
  }).join('');
}

function portrait(deck, favorite) {
  return `<span class="deck-portrait ${deck.id === 'auto' ? 'deck-auto' : ''}" aria-hidden="true">
    <span class="deck-cover">${deck.cover ? `<img src="/art/${encodeURIComponent(deck.cover.id)}" alt="" loading="lazy" draggable="false">` : icon('cards')}</span>
    <span class="deck-frame-top"></span><span class="deck-frame-bottom"></span>
    ${favorite || deck.starter ? `<span class="deck-ribbon" title="${favorite ? 'Favorite' : 'Starter deck'}">★</span>` : ''}
    <span class="deck-regions">${badges(deck.regions)}</span>
  </span>`;
}

export function renderDeckSelection(root, ctx, { collection = false } = {}) {
  const { state } = ctx;
  const focused = root.contains(document.activeElement) ? document.activeElement : null;
  const focusId = focused?.id;
  const focusDeckId = focused?.dataset.deckId;
  const caret = focused?.id === 'deck-search' ? focused.selectionStart : null;
  const room = state.lobby;
  const you = room?.players.find((player) => player.isYou);
  const selectionKey = collection ? 'collection' : state.roomCode || null;
  if (selection.room !== selectionKey) {
    selection = { room: selectionKey, id: '', open: false, query: '', scroll: 0 };
  }
  if (state.deckSelectionId) {
    selection.id = state.deckSelectionId;
    selection.open = true;
    selection.query = '';
    state.deckSelectionId = null;
  }
  const decks = (state.decks || []).map(describeDeck);
  if (!collection) decks.push({ id: 'auto', name: 'Auto Deck', regions: [], entries: [], champions: [], total: 40 });
  const favoriteIds = favorites();
  const currentId = you?.deckId === 'submitted' ? state.net.deckId : you?.deckId;
  const selected = decks.find((deck) => deck.id === selection.id);
  const locked = !collection && !!room && (!you || room.started || you.contentPending);
  const back = state.roomCode ? `#/${room?.started ? 'game' : 'lobby'}` : '#/';
  const query = selection.query.toLocaleLowerCase().trim();
  const filtered = decks.filter((deck) => !query || `${deck.name} ${deck.regions.map(regionLabel).join(' ')} ${deck.champions.map(({ card }) => card.name).join(' ')}`.toLocaleLowerCase().includes(query));
  root.classList.add('deck-selection-view');
  root.innerHTML = `
    <section class="deck-selection ${collection ? 'collection-decks' : ''} ${selection.open && selected ? 'is-previewing' : ''}" aria-label="${collection ? 'Saved decks' : 'Deck selection'}">
      ${collection ? collectionNavigation({ decks: true, search: selection.query }) : `
      <nav class="home-rail" aria-label="Main navigation">
        <div class="home-rail-menu">
          <a class="home-nav" href="#/">${icon('home')}<span>Home</span></a>
          <a class="home-nav home-nav-play active" href="#/play" aria-current="page">${icon('play')}<span>Play</span></a>
          <a class="home-nav" href="#/decks">${icon('collection')}<span>Collection</span></a>
          <button class="home-nav unavailable" disabled>${icon('rewards')}<span>Rewards</span><small>Unavailable</small></button>
          <button class="home-nav unavailable" disabled>${icon('pass')}<span>Battle Pass</span><small>Unavailable</small></button>
          <button class="home-nav unavailable" disabled>${icon('store')}<span>Store</span><small>Unavailable</small></button>
        </div>
        <span class="home-rail-brand">Nexus Forge</span>
      </nav>
      <aside class="deck-mode-rail" aria-label="Play modes">
        <div class="deck-mode-menu">
          <button class="deck-mode champions" disabled>The Path of<br>Champions<small>Unavailable</small></button>
          <a class="deck-mode active" href="#/play" aria-current="page">Play<small>With friends</small></a>
          <button class="deck-mode" disabled>VS AI<small>Unavailable</small></button>
          <button class="deck-mode" disabled>Challenges<small>Unavailable</small></button>
          <button class="deck-mode leaderboard" disabled>Leaderboard<small>Unavailable</small></button>
        </div>
        <div class="deck-mode-footer">
          ${state.roomCode ? `<a class="deck-room-link" href="${back}">Room <strong>${esc(state.roomCode)}</strong><span>${esc(room?.mode === '2v2' ? '2v2 Team Clash' : '1v1 Duel')}</span></a>` : '<p>1v1 Duel · 2v2 Clash<br><span>Your friends. Your decks.</span></p>'}
          <label class="home-sr-only" for="deck-search">Search decks, champions, or regions</label>
          <input id="deck-search" class="deck-search" type="search" placeholder="Find a deck…" autocomplete="off" value="${esc(selection.query)}">
          <a class="deck-workshop-link" href="#/decks">Manage decks <span aria-hidden="true">↗</span></a>
        </div>
      </aside>
      `}
      <header class="deck-selection-header">
        <h1>${collection ? 'Your decks' : 'Select your deck'}</h1>
        ${collection ? '<a class="collection-new-deck" href="#/deck/new">＋ New deck</a>' : ''}
        <span class="deck-selection-count">${state.decks.length} saved decks</span>
        <a href="${back}" class="deck-selection-crest" aria-label="${state.roomCode ? 'Return to room' : 'Return home'}">${icon('home')}</a>
      </header>
      <div class="deck-selection-body">
        <div class="deck-gallery" tabindex="0" aria-label="Available decks">
          <ul class="deck-grid">${filtered.map((deck) => `<li>
            <button class="deck-tile ${selection.id === deck.id ? 'selected' : ''}" data-deck-id="${esc(deck.id)}" aria-pressed="${selection.id === deck.id}" aria-label="${esc(deck.name)}, ${deck.total} cards${deck.id === currentId ? ', equipped' : ''}">
              ${portrait(deck, favoriteIds.has(deck.id))}
              <span class="deck-tile-name">${esc(deck.name)}</span>
              <span class="deck-tile-rule"></span>
              ${deck.id === currentId ? '<span class="deck-equipped">Equipped</span>' : ''}
            </button>
          </li>`).join('')}</ul>
          ${filtered.length ? '' : '<div class="deck-empty" role="status">No decks match your search.<button id="deck-clear-search">Clear search</button></div>'}
        </div>
        ${selection.open && selected ? `
          <aside class="deck-preview" aria-label="Selected deck">
            <button class="deck-preview-close" id="deck-close-preview" aria-label="Close deck preview">✕</button>
            <span class="deck-preview-eyebrow">${collection ? 'Your collection' : room ? 'Your loadout' : 'Play with friends'}</span>
            <h2>${esc(selected.name)}</h2>
            <div class="deck-preview-card">
            <div class="deck-preview-portrait">${portrait(selected, favoriteIds.has(selected.id))}</div>
            <div class="deck-preview-tools">
              ${selected.id !== 'auto' ? `<button id="deck-favorite" aria-pressed="${favoriteIds.has(selected.id)}"><span aria-hidden="true">★</span>${favoriteIds.has(selected.id) ? 'Favorited' : 'Favorite'}</button><a id="deck-edit-selected" href="#/deck/${encodeURIComponent(selected.id)}"><span aria-hidden="true">${icon('cards')}</span>${selected.starter ? 'Edit a copy' : 'Edit'}</a>` : ''}
            </div>
            </div>
            <p class="deck-preview-regions">${selected.id === 'auto' ? 'A fresh, legal deck for every game' : esc(selected.regions.map(regionLabel).join(' · ') || 'Runeterra')}</p>
            <div class="deck-preview-facts"><span><strong>${selected.total}</strong> cards</span><span><strong>${selected.id === 'auto' ? '—' : selected.champions.reduce((sum, e) => sum + e.count, 0)}</strong> champions</span></div>
            <p class="deck-preview-champions">${selected.id === 'auto' ? 'Auto Deck uses the room’s enabled card pool and deck rules.' : esc(selected.champions.map(({ card }) => card.name).join(' · ') || 'No champions in this deck')}</p>
            <div class="deck-preview-action">
              <p id="deck-selection-status" role="status">${collection ? (selected.starter ? 'Starter decks open as an editable copy.' : 'Open this deck in the builder.') : locked ? (!you ? 'You are spectating this room.' : room.started ? 'This match has already started.' : 'Waiting for the host to review your custom cards.') : room ? 'Confirm this deck, then ready up in the room.' : 'Create a room with this deck, then invite your friends.'}</p>
              <button id="deck-confirm" class="deck-play-button ${collection ? '' : 'deck-online-action'}" data-locked="${locked || !selected.total}" ${!collection && (locked || !state.connected || !selected.total) ? 'disabled' : ''}>${collection ? (selected.starter ? 'Edit a copy' : 'Edit deck') : room ? 'Select deck' : 'Play'}</button>
              <a href="${back}" class="deck-back-link">${state.roomCode ? 'Back to room' : 'Back home'}</a>
            </div>
          </aside>` : ''}
      </div>
    </section>`;

  const gallery = root.querySelector('.deck-gallery');
  gallery.scrollTop = selection.scroll;
  gallery.addEventListener('scroll', () => { selection.scroll = gallery.scrollTop; }, { passive: true });
  const redraw = (focusSelector) => {
    renderDeckSelection(root, ctx, { collection });
    if (focusSelector) root.querySelector(focusSelector)?.focus({ preventScroll: true });
  };
  root.querySelectorAll('[data-deck-id]').forEach((button) => button.addEventListener('click', () => {
    selection.id = button.dataset.deckId;
    selection.open = true;
    redraw('#deck-confirm:enabled, #deck-close-preview');
  }));
  const closePreview = () => {
    selection.open = false;
    redraw();
    [...root.querySelectorAll('[data-deck-id]')].find((button) => button.dataset.deckId === selection.id)?.focus({ preventScroll: true });
  };
  root.querySelector('#deck-close-preview')?.addEventListener('click', closePreview);
  root.querySelector('.deck-selection').addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selection.open) { event.preventDefault(); closePreview(); }
  });
  root.querySelector('#deck-search').addEventListener('input', (event) => {
    const position = event.target.selectionStart;
    selection.query = event.target.value;
    selection.scroll = 0;
    redraw('#deck-search');
    root.querySelector('#deck-search').setSelectionRange?.(position, position);
  });
  root.querySelector('#deck-clear-search')?.addEventListener('click', () => {
    selection.query = ''; redraw('#deck-search');
  });
  root.querySelector('#deck-favorite')?.addEventListener('click', () => {
    if (favoriteIds.has(selected.id)) favoriteIds.delete(selected.id);
    else favoriteIds.add(selected.id);
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favoriteIds])); }
    catch { ctx.toast('Could not save favorites on this device.', 'error'); }
    redraw('#deck-favorite');
  });
  const rememberEditorOrigin = () => { state.deckEditorReturn = { deckId: selected.id, route: collection ? '#/collection/decks' : '#/play' }; };
  root.querySelector('#deck-edit-selected')?.addEventListener('click', rememberEditorOrigin);
  root.querySelector('#deck-confirm')?.addEventListener('click', async (event) => {
    if (collection && selected) { rememberEditorOrigin(); ctx.navigate(`#/deck/${encodeURIComponent(selected.id)}`); return; }
    if (!selected || locked || !state.connected) return;
    event.currentTarget.disabled = true;
    event.currentTarget.dataset.submitting = 'true';
    let sent = false;
    try {
      if (!state.roomCode) sent = await ctx.createRoom(selected.id);
      else {
        sent = state.desktop && state.net.role === 'guest'
          ? await ctx.submitGuestDeck(selected.id)
          : ctx.send('setDeck', { deckId: selected.id });
        if (sent) ctx.navigate('#/lobby');
      }
    } finally {
      // Name prompts can be cancelled; restore the action if this view is still open.
      if (!sent && root.isConnected && location.hash === '#/play') redraw();
    }
  });
  const restoreFocus = focusId ? root.querySelector(`#${focusId}`)
    : [...root.querySelectorAll('[data-deck-id]')].find((button) => button.dataset.deckId === focusDeckId);
  if (restoreFocus) {
    restoreFocus.focus({ preventScroll: true });
    if (caret != null) restoreFocus.setSelectionRange(caret, caret);
  }
}
