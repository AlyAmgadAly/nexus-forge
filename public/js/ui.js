// Shared rendering helpers for the Nexus Forge client.
export const SPEED_KEYWORDS = new Set(['Burst', 'Fast', 'Slow', 'Focus', 'Skill']);
export const REGION_COLORS = {
  Demacia: '#c9b27a',
  Noxus: '#b64747',
  Ionia: '#d67fa0',
  Freljord: '#7fb6e8',
  PiltoverZaun: '#c99a4a',
  ShadowIsles: '#58b99a',
  Bilgewater: '#4fb3c9',
  Targon: '#9b7fe0',
  Shurima: '#d9b45a',
  BandleCity: '#8fce6b',
  Runeterra: '#c7a2ff',
};
export const REGION_LABELS = {
  PiltoverZaun: 'Piltover & Zaun',
  ShadowIsles: 'Shadow Isles',
  BandleCity: 'Bandle City',
  Runeterra: 'Runeterra',
};

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function regionLabel(r) { return REGION_LABELS[r] || r || ''; }
export function regionColor(r) { return REGION_COLORS[r] || '#9aa8c7'; }
export function regionPips(regions = []) {
  return regions.filter((r) => r !== 'Runeterra').slice(0, 2).map((r) => `<span class="region-pip" style="background:${regionColor(r)}" title="${esc(regionLabel(r))}"></span>`).join('')
    || '<span class="region-pip" style="background:#c7a2ff" title="Runeterra"></span>';
}

let cardIndex = new Map();
export function setCardIndex(cards) {
  cardIndex = new Map((cards || []).map((c) => [c.id, c]));
}
export function cardById(id) { return cardIndex.get(id) || null; }

function keywordChips(keywords = [], limit = 4) {
  const list = (keywords || []).filter((k) => !SPEED_KEYWORDS.has(k));
  return list.slice(0, limit).map((k) => `<span class="keyword">${esc(k)}</span>`).join('');
}

export function cardHtml(card, opts = {}) {
  if (!card || card.hidden) {
    return `<div class="card card-back ${opts.compact ? 'compact' : ''} ${opts.small ? 'small' : ''} ${opts.className || ''}" ${opts.attrs || ''}>
      <div class="card-shade"></div>
      <div class="card-back-mark">✦</div>
    </div>`;
  }
  const type = String(card.type || 'Unit');
  const isSpell = type === 'Spell';
  const typeClass = isSpell ? 'type-spell' : (type === 'Landmark' ? 'type-landmark' : (type === 'Equipment' ? 'type-equipment' : 'type-unit'));
  const classes = ['card', typeClass, opts.compact ? 'compact' : '', opts.small ? 'small' : '', opts.selected ? 'selected' : '',
    opts.playable ? 'playable' : '', opts.dim ? 'dim' : '', opts.disabled ? 'disabled' : '', opts.className || ''].filter(Boolean).join(' ');
  const attrs = [
    `data-card-id="${esc(card.id)}"`,
    opts.iid ? `data-iid="${esc(opts.iid)}"` : '',
    opts.uid ? `data-uid="${esc(opts.uid)}"` : '',
    opts.noTooltip ? 'data-no-tooltip="1"' : '',
    opts.attrs || '',
  ].filter(Boolean).join(' ');
  const keywords = keywordChips(card.keywords, opts.compact ? 3 : 4);
  const text = esc(card.text || '').replace(/\r?\n/g, '<br>');
  const badge = opts.badge ? `<span class="card-badge ${esc(opts.badgeClass || '')}">${esc(opts.badge)}</span>` : '';
  const speed = card.spellSpeed || (card.keywords || []).find((k) => SPEED_KEYWORDS.has(k)) || '';
  const stats = isSpell
    ? (speed ? `<span class="card-speed">${esc(speed)}</span>` : '')
    : `<div class="card-stats">
        ${card.attack != null ? `<span class="stat-glyph power">${esc(card.attack)}</span>` : ''}
        ${card.health != null ? `<span class="stat-glyph health">${esc(card.health)}</span>` : ''}
      </div>`;
  return `<div class="${classes}" ${attrs}>
    <img class="card-art" src="/art/${encodeURIComponent(card.id)}" alt="" loading="lazy" draggable="false">
    <div class="card-shade"></div>
    <div class="card-frame"></div>
    ${badge}
    <div class="card-top">
      <div class="cost-gem">${esc(card.cost ?? 0)}</div>
      <div class="row" style="gap:3px">${regionPips(card.regions)}</div>
    </div>
    <div class="card-name">${esc(card.name)}</div>
    ${opts.hideText || opts.small ? '' : `<div class="card-text">${text}</div>`}
    <div class="card-bottom">
      <div class="card-keywords">${keywords}</div>
      ${stats}
    </div>
  </div>`;
}

export function unitHtml(unit, opts = {}) {
  if (!unit) return '';
  const status = unit.statuses || {};
  const badges = [];
  if (status.barrier) badges.push('<span class="st" title="Barrier">🛡</span>');
  if (status.spellShield) badges.push('<span class="st" title="Spell Shield">✦</span>');
  if (status.stunned) badges.push('<span class="st" title="Stunned">✸</span>');
  if (status.frostbitten) badges.push('<span class="st" title="Frostbitten">❄</span>');
  if (unit.leveled) badges.push('<span class="st" title="Leveled up">↑</span>');
  const keywords = (unit.keywords || []).filter((k) => !SPEED_KEYWORDS.has(k)).slice(0, 4);
  const classes = ['unit-card', opts.selected ? 'selected' : '', opts.targetable ? 'targetable' : '',
    opts.attacker ? 'attacker' : '', opts.blocker ? 'blocker' : '', opts.dim ? 'dim' : '', opts.className || ''].filter(Boolean).join(' ');
  const art = unit.cardId ? `/art/${encodeURIComponent(unit.cardId)}` : '';
  const damaged = unit.damage > 0;
  const power = unit.power ?? 0;
  const health = unit.health ?? 0;
  return `<div class="${classes}" data-uid="${esc(unit.uid)}" data-card-id="${esc(unit.cardId || '')}" data-team="${esc(unit.team || '')}" ${opts.attrs || ''}>
    ${art ? `<img src="${art}" alt="" loading="lazy" draggable="false">` : ''}
    <div class="unit-shade"></div>
    <span class="unit-owner team-${esc(unit.team || 'A')}" title="Owner"></span>
    <div class="unit-statuses">${badges.join('')}</div>
    <div class="unit-keywords">${keywords.map((k) => `<span class="keyword">${esc(k)}</span>`).join('')}</div>
    <div class="unit-name">${esc(unit.name)}</div>
    <div class="unit-stats">
      <span class="stat-glyph power">${esc(power)}</span>
      <span class="stat-glyph health ${damaged ? 'unit-damage' : ''}" title="${damaged ? `${unit.damage} damage taken` : ''}">${esc(health)}</span>
    </div>
  </div>`;
}

export function manaGems(team) {
  const max = Math.max(0, Number(team?.maxMana || 0));
  const filled = Math.max(0, Number(team?.mana || 0));
  const spell = Math.max(0, Number(team?.spellMana || 0));
  let html = '<div class="mana-row">';
  for (let i = 0; i < Math.max(max, 1); i++) html += `<span class="mana-gem ${i < filled ? 'full' : ''}" title="${i < filled ? 'Available mana' : 'Mana gem'}"></span>`;
  for (let i = 0; i < spell; i++) html += '<span class="mana-gem spell" title="Spell mana"></span>';
  html += '</div>';
  return html;
}

export function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - Number(ts || 0)) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function normalizeLogLine(line) {
  const type = line?.type || 'system';
  const text = line?.text || line?.message || '';
  return `<div class="log-line ${esc(type)}">${esc(text)}</div>`;
}

// ---------------------------------------------------------------- toast / modal
export function toast(message, type = '') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.textContent = message;
  root.appendChild(div);
  setTimeout(() => {
    div.style.opacity = '0';
    div.style.transform = 'translateY(6px)';
    div.style.transition = 'opacity .2s, transform .2s';
    setTimeout(() => div.remove(), 220);
  }, 4200);
}

let currentModal = null;
export function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
  if (currentModal?.onClose) {
    try { currentModal.onClose(); } catch {}
  }
  currentModal = null;
}

export function openModal({ title, subtitle = '', body = '', actions = [], wide = false, narrow = false, className = '', onOpen = null, onClose = null }) {
  closeModal();
  const root = document.getElementById('modal-root');
  if (!root) return null;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = `modal ${wide ? 'wide' : ''} ${narrow ? 'narrow' : ''} ${className}`;
  modal.innerHTML = `
    <div class="modal-head">
      <div><h2>${esc(title || '')}</h2>${subtitle ? `<div class="muted">${esc(subtitle)}</div>` : ''}</div>
      <button class="modal-close" type="button" aria-label="Close">×</button>
    </div>
    <div class="modal-body">${body}</div>
    ${actions.length ? '<div class="modal-actions"></div>' : ''}
  `;
  const actionBar = modal.querySelector('.modal-actions');
  const close = () => closeModal();
  modal.querySelector('.modal-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  for (const action of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn ${action.className || ''}`;
    btn.textContent = action.label;
    if (action.disabled) btn.disabled = true;
    btn.addEventListener('click', async () => {
      if (action.onClick) await action.onClick(modal, close);
      if (action.close !== false) close();
    });
    actionBar.appendChild(btn);
  }
  backdrop.appendChild(modal);
  root.appendChild(backdrop);
  currentModal = { modal, onClose };
  const escHandler = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', escHandler); close(); } };
  document.addEventListener('keydown', escHandler);
  if (onOpen) onOpen(modal, close);
  return { modal, close };
}

export function modalConfirm(title, message, { danger = false, confirmLabel = 'Confirm', cancelLabel = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    openModal({
      title,
      narrow: true,
      body: `<p class="muted">${esc(message)}</p>`,
      actions: [
        { label: cancelLabel, className: 'btn-ghost', onClick: () => finish(false) },
        { label: confirmLabel, className: danger ? 'btn-danger' : 'btn-primary', onClick: () => finish(true) },
      ],
      onClose: () => finish(false),
    });
  });
}

export function modalPrompt(title, { label = '', value = '', placeholder = '', confirmLabel = 'Save', multiline = false } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const input = multiline
      ? `<textarea class="textarea" id="prompt-input" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input class="input" id="prompt-input" value="${esc(value)}" placeholder="${esc(placeholder)}">`;
    openModal({
      title,
      body: `<div class="field"><label class="label">${esc(label || title)}</label>${input}</div>`,
      actions: [
        { label: 'Cancel', className: 'btn-ghost', onClick: () => finish(null) },
        { label: confirmLabel, className: 'btn-primary', onClick: (modal) => finish(modal.querySelector('#prompt-input')?.value ?? '') },
      ],
      onOpen: (modal) => setTimeout(() => modal.querySelector('#prompt-input')?.focus(), 40),
      onClose: () => finish(null),
    });
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text));
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = String(text);
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch { return false; }
  }
}

// ---------------------------------------------------------------- tooltips
let tipEl = null;
let tipTimer = null;
let tipCard = null;
let tipAnchor = null;

function ensureTip() {
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  tipEl.className = 'tooltip-root';
  tipEl.style.display = 'none';
  document.body.appendChild(tipEl);
  return tipEl;
}

function showTip(card, anchor) {
  if (!card || !anchor || !anchor.isConnected) return;
  ensureTip();
  const keywords = (card.keywords || []).filter((k) => !SPEED_KEYWORDS.has(k));
  tipEl.innerHTML = `<div class="card-tooltip">
    <h4>${esc(card.name)}</h4>
    <div class="tt-meta">${esc(card.type || '')}${card.supertype ? ` · ${esc(card.supertype)}` : ''}${card.cost != null ? ` · ${esc(card.cost)} mana` : ''}${card.attack != null ? ` · ${esc(card.attack)}|${esc(card.health)}` : ''}${card.spellSpeed ? ` · ${esc(card.spellSpeed)}` : ''}</div>
    <div class="tt-text">${esc(card.text || card.flavor || 'No card text.')}</div>
    ${keywords.length ? `<div class="tt-kw">${keywords.map((k) => `<span class="keyword">${esc(k)}</span>`).join('')}</div>` : ''}
  </div>`;
  tipEl.style.display = 'block';
  const rect = anchor.getBoundingClientRect();
  const tw = 260;
  let left = rect.right + 10;
  if (left + tw > window.innerWidth - 10) left = Math.max(10, rect.left - tw - 10);
  let top = Math.min(window.innerHeight - 220, rect.top + 8);
  if (top < 10) top = 10;
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${top}px`;
  tipCard = card;
  tipAnchor = anchor;
}

function hideTip() {
  if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
  if (tipEl) tipEl.style.display = 'none';
  tipCard = null;
  tipAnchor = null;
}

export function initTooltips() {
  document.addEventListener('mouseover', (e) => {
    const anchor = e.target.closest('[data-card-id]');
    if (!anchor || anchor.dataset.noTooltip) return;
    const id = anchor.dataset.cardId;
    if (!id || anchor === tipAnchor) return;
    if (tipTimer) clearTimeout(tipTimer);
    tipTimer = setTimeout(() => {
      const card = cardById(id);
      if (card) showTip(card, anchor);
    }, 320);
  });
  document.addEventListener('mouseout', (e) => {
    const anchor = e.target.closest('[data-card-id]');
    if (!anchor) return;
    if (e.relatedTarget?.closest?.('[data-card-id]') === anchor) return;
    hideTip();
  });
  document.addEventListener('mousemove', (e) => {
    if (!tipEl || tipEl.style.display === 'none') return;
    // Keep the tooltip adjacent to the card rather than the cursor.
    if (tipAnchor && !tipAnchor.isConnected) hideTip();
  });
  window.addEventListener('scroll', hideTip, { passive: true });
}

export function emptyState(icon, title, text = '') {
  return `<div class="empty-state"><div class="icon">${esc(icon)}</div><div><strong>${esc(title)}</strong></div>${text ? `<div class="small muted">${esc(text)}</div>` : ''}</div>`;
}

export function keywordOptions() {
  return ['Barrier', 'Challenger', 'Elusive', 'Fearsome', 'Overwhelm', 'Quick Attack', 'Tough', 'Lifesteal', 'Regeneration', 'Ephemeral', 'Double Attack', 'Spell Shield', 'Fury', 'Impact', 'Attune', 'Augment', 'Deep', 'Fated', 'Flow', 'Formidable', 'Hallowed', 'Lurk', 'Scout', 'Sharpsight', 'Spirit', 'Gloom', 'Deathless', 'Brash', 'Immobile', "Can't Block", "Can't Attack", 'Allegiance', 'Enlightened', 'Evolve', 'Countdown', 'Attach', 'Plunder', 'Daybreak', 'Nightfall'];
}
