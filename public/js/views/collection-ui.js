import { cardHtml, esc, regionLabel } from '../ui.js';
import { icon } from './home.js';

export const COLLECTION_REGIONS = ['BandleCity', 'Bilgewater', 'Demacia', 'Freljord', 'Ionia', 'Noxus', 'PiltoverZaun', 'ShadowIsles', 'Shurima', 'Targon', 'Runeterra'];

export function collectionNavigation({ decks = false, inert = false, search = null } = {}) {
  return `<nav class="home-rail" aria-label="Main navigation" ${inert ? 'inert' : ''}>
    <div class="home-rail-menu">
      <a class="home-nav" href="#/">${icon('home')}<span>Home</span></a>
      <a class="home-nav" href="#/play">${icon('play')}<span>Play</span></a>
      <a class="home-nav active" href="#/decks" aria-current="page">${icon('collection')}<span>Collection</span></a>
      ${[['rewards', 'Rewards'], ['pass', 'Battle Pass'], ['store', 'Store']].map(([key, label]) => `<button class="home-nav unavailable" disabled>${icon(key)}<span>${label}</span><small>Unavailable</small></button>`).join('')}
    </div><span class="home-rail-brand">Nexus Forge</span></nav>
    <aside class="deck-mode-rail collection-modes" aria-label="Collection" ${inert ? 'inert' : ''}>
      <div class="deck-mode-menu">
        <a class="deck-mode ${decks ? 'active' : ''}" href="#/collection/decks" ${decks ? 'aria-current="page"' : ''}>Decks</a>
        <a class="deck-mode ${decks ? '' : 'active'}" href="#/decks" ${decks ? '' : 'aria-current="page"'}>Cards</a>
        ${['Skins', 'Boards', 'Guardians', 'Card backs', 'Emotes'].map(label => `<button class="deck-mode" disabled>${label}<small>Unavailable</small></button>`).join('')}
      </div>
      <div class="deck-mode-footer">${search !== null ? `<label class="home-sr-only" for="deck-search">Search decks</label><input id="deck-search" class="deck-search" type="search" placeholder="Find a deck…" value="${esc(search)}">` : ''}<a class="collection-new-deck" href="#/deck/new">＋ New deck</a><p>Every enabled card is available.</p></div>
    </aside>`;
}

export function collectionCardFace(card, { lazy = true } = {}) {
  const face = card.source === 'riot' && /^https?:\/\//.test(card.art || '');
  return face ? `<span class="collection-face-placeholder" aria-hidden="true"><strong>${esc(card.name)}</strong><span>${card.cost ?? 0} mana · ${esc(card.supertype || card.type)}</span></span><img src="/art/${encodeURIComponent(card.id)}?face=1" alt="${esc(card.name)}" ${lazy ? 'loading="lazy"' : ''} draggable="false">`
    : cardHtml(card, { noTooltip: true });
}

function cardTile(card, { editing, count, maxCopies, canAdd }) {
  return `<article class="collection-card ${editing && !canAdd ? 'at-limit' : ''}">
    <button class="collection-card-face" data-pool-card="${esc(card.id)}" aria-label="${editing ? 'Add' : 'Inspect'} ${esc(card.name)}, ${card.cost ?? 0} mana${editing ? `, ${count} in deck` : ''}" ${editing && !canAdd ? 'aria-disabled="true"' : ''}>
      ${collectionCardFace(card)}
      ${editing && count ? `<span class="collection-card-count">${count}/${maxCopies}</span>` : ''}
    </button>
    <div class="collection-copy-dots" aria-label="${editing ? `${count} copies in deck` : `${maxCopies} copies available`}">${Array.from({ length: maxCopies }, (_, i) => `<span class="${i < (editing ? count : maxCopies) ? 'filled' : ''}"></span>`).join('')}</div>
    ${editing ? `<button class="collection-inspect" data-inspect-card="${esc(card.id)}" aria-label="Inspect ${esc(card.name)}">ⓘ</button>` : ''}
  </article>`;
}

function filterDrawer(filters, sets) {
  const group = (title, key, choices, extra = '') => `<fieldset class="collection-filter-group ${extra}"><legend>${title}</legend><div class="collection-filter-choices">${choices.map(([value, label, glyph]) => `<button type="button" data-filter="${key}" data-value="${value}" class="${filters[key] === value ? 'selected' : ''}" aria-pressed="${filters[key] === value}"><span class="filter-glyph ${key === 'rarity' ? `rarity-${value.toLowerCase()}` : ''}" aria-hidden="true">${glyph}</span><span>${label}</span></button>`).join('')}</div></fieldset>`;
  return `<aside class="collection-filter-drawer" aria-label="Card filters">
    <button id="filters-close" class="collection-filter-close" aria-label="Close filters">✕</button>
    ${group('Card type', 'type', [['Unit', 'Units', '♜'], ['Spell', 'Spells', '♨'], ['Landmark', 'Landmarks', '♜'], ['Equipment', 'Equipment', '⚒']])}
    ${group('Rarity', 'rarity', [['Common', 'Common', '◆'], ['Rare', 'Rare', '◆'], ['Epic', 'Epic', '◆'], ['Champion', 'Champion', '⬟']])}
    ${group('Mana cost', 'cost', Array.from({ length: 9 }, (_, n) => [String(n), n === 8 ? '8+' : String(n), n === 8 ? '8+' : String(n)]), 'mana-filter')}
    <fieldset class="collection-filter-group"><legend>Filter by set</legend><label class="home-sr-only" for="filter-set">Set</label><select id="filter-set" class="collection-filter-select"><option value="">All sets</option>${sets.map(([value, name]) => `<option value="${esc(value)}" ${filters.set === value ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></fieldset>
    <fieldset class="collection-filter-group"><legend>Sort cards</legend><label class="home-sr-only" for="filter-sort">Sort cards</label><select id="filter-sort" class="collection-filter-select">${[['champions', 'Champions first'], ['cost', 'Mana cost'], ['name', 'Name'], ['attack', 'Attack'], ['health', 'Health']].map(([value, name]) => `<option value="${value}" ${filters.sort === value ? 'selected' : ''}>${name}</option>`).join('')}</select></fieldset>
    <button id="filters-reset" class="collection-reset">Reset filters</button>
  </aside>`;
}

export function renderCollectionMarkup(model) {
  const { state, filters, editing, filtersOpen, menu, visible, filteredCount, poolLimit, maxCopies, countFor, checkFor, deckPane } = model;
  const activeFilters = [filters.type, filters.rarity, filters.cost, filters.set].filter(Boolean).length;
  const trigger = (name, label, extra = '') => `<button class="collection-toolbar-button ${menu === name ? 'open' : ''}" id="collection-${name}" aria-haspopup="true" aria-expanded="${menu === name}" ${extra}>${label}<span class="collection-chevron" aria-hidden="true"></span></button>`;
  return `<section class="deck-selection collection-shell ${editing ? 'is-editing' : ''} ${filtersOpen ? 'filters-open' : ''}" aria-label="${editing ? 'Deck builder' : 'Card collection'}">
    ${editing ? '' : collectionNavigation({ inert: filtersOpen })}
    ${filtersOpen ? filterDrawer(filters, model.sets) : ''}
    <header class="collection-toolbar">
      <button id="collection-filters" class="collection-filter-toggle ${filtersOpen || activeFilters ? 'active' : ''}" aria-label="Card filters" aria-expanded="${filtersOpen}" title="Filter by type, rarity, mana and set"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 10h30M5 20h30M5 30h30M13 5v10M27 15v10M17 25v10"/></svg>${activeFilters ? `<span>${activeFilters}</span>` : ''}</button>
      ${trigger('scope', filters.scope === 'in' ? 'In this deck' : filters.scope === 'out' ? 'Not in deck' : 'All cards')}
      ${trigger('regions', `${filters.region ? `<img src="/assets/regions/${filters.region}.png" alt="">` : '<span class="collection-all-regions">R</span>'}<span>${filters.region ? esc(regionLabel(filters.region)) : 'All regions'}</span>`)}
      ${trigger('format', filters.format === 'standard' ? 'Standard' : 'Eternal', 'title="Filters the pinned card data; room rules are unchanged"')}
      <label class="collection-search"><span aria-hidden="true">⌕</span><span class="home-sr-only">Search cards</span><input id="pool-search" type="search" placeholder="Search" autocomplete="off" value="${esc(filters.q)}"></label>
      <a class="collection-return deck-selection-crest" href="${state.roomCode ? '#/lobby' : '#/'}" aria-label="${state.roomCode ? 'Return to room' : 'Return home'}">${icon('collection')}</a>
    </header>
    ${menu ? `<div class="collection-menu collection-menu-${menu}" role="group" aria-label="${menu === 'regions' ? 'Region filter' : menu === 'format' ? 'Card format' : 'Card scope'}">
      ${menu === 'regions' ? [...COLLECTION_REGIONS, ''].map(region => `<button data-menu-value="${region}" aria-pressed="${filters.region === region}">${region ? `<img src="/assets/regions/${region}.png" alt="">` : '<span class="collection-all-regions">R</span>'}<span>${region ? esc(regionLabel(region)) : 'All regions'}</span>${filters.region === region ? '<b aria-hidden="true">✓</b>' : ''}</button>`).join('')
        : (menu === 'format' ? [['standard', 'Standard'], ['eternal', 'Eternal']] : [['all', 'All cards'], ['in', 'In this deck'], ['out', 'Not in deck']]).map(([value, label]) => `<button data-menu-value="${value}" aria-pressed="${filters[menu === 'format' ? 'format' : 'scope'] === value}">${label}${filters[menu === 'format' ? 'format' : 'scope'] === value ? '<b aria-hidden="true">✓</b>' : ''}</button>`).join('')}
    </div>` : ''}
    <div class="collection-results" role="status">${filteredCount} cards${filteredCount > poolLimit ? ` · showing ${poolLimit}` : ''}${editing ? ' · click to add' : ' · click to inspect'}<button id="collection-clear" ${!filters.q && !filters.region && !activeFilters && filters.scope === 'all' && filters.format === 'eternal' ? 'hidden' : ''}>Clear filters</button></div>
    <div class="collection-pool pool-scroll" id="pool-scroll" aria-label="Card library" tabindex="0">
      <div class="collection-grid" id="pool-grid">${visible.map(card => cardTile(card, { editing, count: countFor(card.id), maxCopies, canAdd: checkFor(card).ok })).join('')}</div>
      ${visible.length ? '' : '<div class="collection-empty">No cards match these filters.<button id="collection-empty-clear">Clear filters</button></div>'}
      ${filteredCount > poolLimit ? `<button class="collection-load-more" id="pool-more">Show ${Math.min(48, filteredCount - poolLimit)} more cards</button>` : ''}
    </div>
    ${editing ? deckPane : `<a class="collection-build-shortcut" href="#/deck/new">＋ Build a deck</a>`}
    ${editing ? '<div class="builder-card-preview collection-card-face" id="deck-hover-preview" role="tooltip" aria-hidden="true" hidden></div>' : ''}
  </section>`;
}
