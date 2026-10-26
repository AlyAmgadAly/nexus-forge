import {
  esc, cardHtml, unitHtml, cardById, openModal, modalConfirm, toast, normalizeLogLine,
} from '../ui.js';

let gameId = null;
let mulliganSelected = new Set();
let attackMode = false;
let selectedAttackers = new Set();
let choiceSelected = new Set();
let choiceKey = '';
let historyOpen = false;
let lastRoundSeen = 0;
let splashRound = null;
let splashUntil = 0;

const ICONS = {
  history: '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5z"/><path d="M7.5 2v17"/><path d="M10.5 7h6M10.5 11h6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9a2.9 2.9 0 1 1 5 2.1c-.9.8-1.6 1.4-1.6 3"/><path d="M12.5 17.5h.01"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  swords: '<path d="M4.2 4.2l10.4 10.4M19.8 4.2L9.4 14.6"/><path d="M13.2 4.5l6.3 6.3M7 12.6l4.4 4.4"/><path d="M4.5 19.5l3.1-3.1M19.5 19.5l-3.1-3.1"/><path d="M6 18l-2 2M18 18l2 2"/>',
  shield: '<path d="M12 3l7 3v5.4c0 4.3-2.8 7.7-7 9.6-4.2-1.9-7-5.3-7-9.6V6z"/><path d="M9.2 12l2 2 3.8-4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  cards: '<rect x="4" y="3" width="12" height="17" rx="2"/><path d="M8 1h10a2 2 0 0 1 2 2v13"/><path d="M8 7h4M8 11h4"/>',
  flame: '<path d="M12 22c4.4 0 7-2.7 7-6.6 0-3.1-1.8-5.6-4.4-7.9-.4 2-1.3 3.3-2.7 4.3.2-3.4-1.2-6.2-3.5-8.3.1 3.4-1.3 5.7-3.1 7.8A8 8 0 0 0 5 15.4C5 19.3 7.6 22 12 22z"/>',
  check: '<path d="M5 12.5l4.4 4.4L19 7.3"/>',
};

function icon(name, cls = '') {
  return `<svg class="lor-svg ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function myTeamOf(view) { return view.you?.team || null; }
function otherTeam(team) { return team === 'A' ? 'B' : 'A'; }
function allUnits(view) { return [...(view.teams?.A?.board || []), ...(view.teams?.B?.board || [])]; }
function findUnit(view, uid) { return allUnits(view).find((u) => u.uid === uid) || null; }
function teamPlayers(view, team) { return view.teams?.[team]?.players || []; }
function phaseName(view) {
  if (view.phase === 'mulligan') return 'Mulligan';
  if (view.phase === 'gameover') return 'Game over';
  if (view.phase === 'combat') return view.combat?.stage === 'blockers' ? 'Combat · blockers' : 'Combat · spells';
  return 'Playing';
}
function priorityName(view) {
  if (view.winner) return 'Table decided';
  if (view.phase === 'mulligan') return 'Choose your opening hand';
  if (view.pending) return view.pending.waiting ? `Waiting on ${view.pending.playerName}` : 'Resolve the choice';
  return view.priorityTeam ? `${view.teams[view.priorityTeam]?.name || `Team ${view.priorityTeam}`} has priority` : '—';
}
function unitHasKeyword(unit, keyword) { return (unit?.keywords || []).some((k) => k.toLowerCase() === keyword.toLowerCase()); }
function unitMatchesFilter(unit, filter = {}) {
  if (!unit) return false;
  if (filter.type === 'champion' && !unit.isChampion) return false;
  if (filter.type === 'follower' && unit.isChampion) return false;
  if (filter.type === 'landmark' && !unit.isLandmark) return false;
  if (filter.type === 'unit' && unit.isLandmark) return false;
  if (filter.keyword && !unitHasKeyword(unit, filter.keyword)) return false;
  if (filter.notKeyword && unitHasKeyword(unit, filter.notKeyword)) return false;
  if (filter.subtype && !(unit.subtypes || []).includes(filter.subtype)) return false;
  if (filter.region && !(unit.regions || []).includes(filter.region)) return false;
  if (filter.minPower != null && (unit.power ?? 0) < filter.minPower) return false;
  if (filter.maxPower != null && (unit.power ?? 0) > filter.maxPower) return false;
  if (filter.minHealth != null && (unit.health ?? 0) < filter.minHealth) return false;
  if (filter.maxHealth != null && (unit.health ?? 0) > filter.maxHealth) return false;
  if (filter.minCost != null && (unit.cost ?? 0) < filter.minCost) return false;
  if (filter.maxCost != null && (unit.cost ?? 0) > filter.maxCost) return false;
  if (filter.damaged === true && !(unit.damage > 0)) return false;
  if (filter.damaged === false && unit.damage > 0) return false;
  return true;
}

function targetOptionsForSpec(spec, view, team) {
  const enemy = otherTeam(team);
  const mine = view.teams[team];
  const theirs = view.teams[enemy];
  const filter = spec.filter || {};
  const choose = (units, side) => units
    .filter((u) => unitMatchesFilter(u, filter))
    .filter((u) => !(u.isLandmark && !String(spec.type).toLowerCase().includes('landmark') && spec.type !== 'anyTarget'))
    .map((u) => ({ id: `u:${u.uid}`, label: `${u.name} (${u.power}|${u.health})`, kind: 'unit', unit: u, side }));
  const nexus = (t, label) => ({ id: `n:${t}`, label: `${label} Nexus (${view.teams[t].nexus})`, kind: 'nexus', team: t });
  const type = String(spec.type || '');
  let list = [];
  if (['allyUnit', 'otherAllyUnit', 'allyChampion', 'allyFollower', 'allyLandmark', 'strongestAlly', 'weakestAlly', 'randomAllyUnit', 'selfUnit'].includes(type)) list = choose(mine.board, 'ally');
  else if (['enemyUnit', 'enemyChampion', 'enemyFollower', 'enemyLandmark', 'strongestEnemy', 'weakestEnemy', 'randomEnemyUnit'].includes(type)) list = choose(theirs.board, 'enemy');
  else if (type === 'anyTarget') list = [...choose([...allUnits(view)], 'any'), nexus(team, mine.name), nexus(enemy, theirs.name)];
  else if (['anyUnit', 'strongestUnit', 'weakestUnit', 'randomUnit'].includes(type)) list = choose([...allUnits(view)], 'any');
  else if (type === 'handCard') {
    list = (view.you?.hand || []).map((h) => ({ id: `h:${h.iid}`, label: `Hand: ${h.name}`, kind: 'hand' }));
  } else if (type === 'enemyNexus') list = [nexus(enemy, theirs.name)];
  else if (type === 'allyNexus') list = [nexus(team, mine.name)];
  else if (type === 'anyNexus') list = [nexus(team, mine.name), nexus(enemy, theirs.name)];
  else if (type === 'self') {
    const source = allUnits(view).find((u) => u.uid === spec.sourceUid);
    if (source) list = [{ id: `u:${source.uid}`, label: source.name, kind: 'unit' }];
  }
  if (type.startsWith('strongest')) {
    const best = list.slice().sort((a, b) => ((b.unit?.power ?? 0) - (a.unit?.power ?? 0)))[0];
    list = best ? [best] : [];
  }
  if (type.startsWith('weakest')) {
    const worst = list.slice().sort((a, b) => ((a.unit?.power ?? 0) - (b.unit?.power ?? 0)))[0];
    list = worst ? [worst] : [];
  }
  return list;
}

function openCardDetails(card, extra = {}, actions = []) {
  if (!card) return;
  const stats = card.type === 'Unit'
    ? `<div class="row mt"><span class="stat-glyph power">${esc(card.attack ?? 0)}</span><span class="stat-glyph health">${esc(card.health ?? 0)}</span></div>` : '';
  openModal({
    title: card.name,
    subtitle: `${card.type || ''}${card.supertype ? ` · ${card.supertype}` : ''}${card.cost != null ? ` · ${card.cost} mana` : ''}`,
    body: `<div class="card-admin-preview">
      ${cardHtml(card, { noTooltip: true })}
      <div class="grow">
        ${stats}
        <div class="muted mt" style="white-space:pre-wrap;line-height:1.6">${esc(card.text || 'No card text.')}</div>
        ${card.levelup ? `<div class="notice gold mt small"><strong>Level up:</strong> ${esc(card.levelup)}</div>` : ''}
        <div class="row wrap mt">${(card.keywords || []).map((k) => `<span class="keyword">${esc(k)}</span>`).join('')}</div>
        <div class="small muted mt">${esc((card.regions || []).join(' + ') || 'Neutral')}${card.setName ? ` · ${esc(card.setName)}` : ''}</div>
        ${extra.html || ''}
      </div>
    </div>`,
    actions: [{ label: 'Close', className: 'btn-ghost' }, ...actions],
  });
}

function playCard(iid, view, ctx, root) {
  const handCard = (view.you?.hand || []).find((h) => h.iid === iid);
  if (!handCard) return;
  const card = cardById(handCard.id) || handCard;
  if (!view.legal?.playable?.includes(iid)) {
    openCardDetails({ ...card, ...handCard });
    return;
  }
  let specs = Array.isArray(card.targetSpecs) ? card.targetSpecs.slice() : [];
  if (card.type === 'Equipment' && !specs.length) specs = [{ type: 'allyUnit', count: 1, prompt: 'Attach to an ally' }];
  if (!specs.length) {
    ctx.send('play', { iid });
    return;
  }
  const team = view.you.team;
  const groups = specs.map((spec) => ({ spec, options: targetOptionsForSpec(spec, view, team), chosen: [] }));
  const groupsHtml = groups.map((g, i) => `
    <div class="target-group mb" data-spec-group="${i}">
      <div class="row between" style="margin-bottom:5px"><strong class="small">${esc(g.spec.prompt || `Choose ${g.spec.type}`)}</strong><span class="tag">${g.spec.count || 1}</span></div>
      <div class="target-chips">
        ${g.options.length ? g.options.map((o) => `<button type="button" class="target-chip ${o.kind === 'nexus' ? 'nexus' : ''}" data-spec="${i}" data-target-id="${esc(o.id)}">${esc(o.label)}</button>`).join('') : '<span class="tiny red">No legal targets.</span>'}
      </div>
    </div>`).join('');
  openModal({
    title: `Play ${card.name}`,
    subtitle: specs.length > 1 ? 'Choose each target in order, then confirm.' : (specs[0].prompt || 'Choose a target.'),
    body: `<div class="row" style="gap:12px;align-items:flex-start">
      ${cardHtml({ ...card, ...handCard }, { compact: true, noTooltip: true })}
      <div class="grow"><div class="muted small" style="white-space:pre-wrap">${esc(card.text || '')}</div><div class="target-groups mt">${groupsHtml}</div></div>
    </div>`,
    actions: [
      { label: 'Cancel', className: 'btn-ghost' },
      {
        label: 'Play card', className: 'btn-primary', close: false, onClick: (modal, close) => {
          const targets = [];
          for (const group of groups) {
            if (group.chosen.length < (group.spec.count || 1)) {
              toast(`Choose ${group.spec.count || 1} target${(group.spec.count || 1) === 1 ? '' : 's'} for ${group.spec.prompt || group.spec.type}.`, 'error');
              return;
            }
            targets.push(...group.chosen.slice(0, group.spec.count || 1));
          }
          close();
          ctx.send('play', { iid, targets });
        },
      },
    ],
    onOpen: (modal) => {
      modal.querySelectorAll('[data-target-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const group = groups[Number(btn.dataset.spec)];
          const id = btn.dataset.targetId;
          const count = group.spec.count || 1;
          if (count === 1) group.chosen = [id];
          else if (group.chosen.includes(id)) group.chosen = group.chosen.filter((x) => x !== id);
          else if (group.chosen.length < count) group.chosen.push(id);
          const groupEl = modal.querySelector(`[data-spec-group="${btn.dataset.spec}"]`);
          groupEl?.querySelectorAll('[data-target-id]').forEach((b) => b.classList.toggle('selected', group.chosen.includes(b.dataset.targetId)));
        });
      });
    },
  });
}

function openBlockModal(view, ctx, root) {
  const team = view.you?.team;
  if (!team) return;
  const attackers = (view.combat?.attackers || []).map((uid) => findUnit(view, uid)).filter(Boolean);
  const defenders = view.teams[team].board.filter((u) => u.canBlock);
  const canProbablyBlock = (blocker, attacker) => {
    if (!blocker || !attacker) return false;
    if (blocker.statuses?.stunned || blocker.isLandmark) return false;
    if (unitHasKeyword(blocker, 'Immobile') || unitHasKeyword(blocker, "Can't Block")) return false;
    if (unitHasKeyword(attacker, 'Elusive') && !unitHasKeyword(blocker, 'Elusive') && !unitHasKeyword(blocker, 'Sharpsight')) return false;
    if (unitHasKeyword(attacker, 'Fearsome') && (blocker.power || 0) < 3) return false;
    if (unitHasKeyword(attacker, 'Brash') && (blocker.health || 0) < 3) return false;
    return true;
  };
  openModal({
    title: 'Declare blockers',
    subtitle: 'Assign at most one blocker to each attacker. Unblocked attackers strike the Nexus.',
    body: `<div class="stack">${attackers.map((a) => {
      const options = defenders.filter((d) => canProbablyBlock(d, a));
      return `<div class="panel soft" style="padding:10px"><div class="row between mb"><strong>${esc(a.name)} <span class="muted tiny">${a.power}|${a.health}</span></strong><span class="tag">attacker</span></div>
        <select class="select input-sm" data-block-for="${esc(a.uid)}">
          <option value="">No blocker — strike the Nexus</option>
          ${options.map((d) => `<option value="${esc(d.uid)}">${esc(d.name)} (${d.power}|${d.health})</option>`).join('')}
        </select></div>`;
    }).join('') || '<div class="muted">No attackers.</div>'}</div>`,
    actions: [
      { label: 'No blockers', className: 'btn-ghost', close: false, onClick: (modal, close) => { close(); ctx.send('block', { blocks: {} }); } },
      {
        label: 'Confirm blocks', className: 'btn-primary', close: false, onClick: (modal, close) => {
          const selects = [...modal.querySelectorAll('[data-block-for]')];
          const used = new Set();
          const blocks = {};
          for (const sel of selects) {
            const bl = sel.value;
            if (!bl) continue;
            if (used.has(bl)) { toast('A unit can only block one attacker.', 'error'); return; }
            used.add(bl);
            blocks[sel.dataset.blockFor] = bl;
          }
          close();
          ctx.send('block', { blocks });
        },
      },
    ],
    onOpen: (modal) => {
      modal.querySelectorAll('[data-block-for]').forEach((sel) => sel.addEventListener('change', () => {
        const used = new Set([...modal.querySelectorAll('[data-block-for]')].map((s) => s.value).filter(Boolean));
        for (const s of modal.querySelectorAll('[data-block-for]')) {
          for (const opt of s.options) {
            if (!opt.value) continue;
            opt.disabled = used.has(opt.value) && s.value !== opt.value;
          }
        }
      }));
    },
  });
}

function openManualTools(view, ctx) {
  const units = allUnits(view);
  const targets = [
    ...units.map((u) => ({ id: `u:${u.uid}`, label: `${u.name} (${u.team} · ${u.power}|${u.health})` })),
    { id: 'n:A', label: `Team A Nexus (${view.teams.A.nexus})` },
    { id: 'n:B', label: `Team B Nexus (${view.teams.B.nexus})` },
  ];
  const ops = [
    ['damage', 'Damage a unit / Nexus'], ['heal', 'Heal a unit / Nexus'], ['buff', 'Buff stats'], ['keyword', 'Grant keyword'],
    ['removeKeyword', 'Remove keyword'], ['stun', 'Stun'], ['frostbite', 'Frostbite'], ['recall', 'Recall'], ['silence', 'Silence'],
    ['kill', 'Kill'], ['obliterate', 'Obliterate'], ['draw', 'Draw cards'], ['discard', 'Discard cards'], ['summon', 'Summon token'],
    ['create', 'Create card in hand'], ['toss', 'Toss'], ['predict', 'Predict'], ['rally', 'Rally'], ['mana', 'Add mana'],
    ['spellMana', 'Add spell mana'], ['nexusDamage', 'Damage Nexus'], ['nexusHeal', 'Heal Nexus'], ['levelUp', 'Level up'],
    ['log', 'Add a note to the log'],
  ];
  const keywordOpts = ['Barrier', 'Challenger', 'Elusive', 'Fearsome', 'Overwhelm', 'Quick Attack', 'Tough', 'Lifesteal', 'Regeneration', 'Ephemeral', 'Double Attack', 'Spell Shield', 'Impact', 'Fury', 'Attune', 'Hallowed', 'Lurk', 'Scout'];
  openModal({
    title: 'Tabletop tools',
    subtitle: 'Manual resolution for unscripted cards. Every action is logged.',
    body: `<div class="notice gold small mb">These controls are open to every player at the table. Use them when a card’s effect isn’t automated — or when the table agrees on a ruling.</div>
      <div class="form-grid">
        <div class="field"><label class="label">Action</label><select class="select" id="manual-op">${ops.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Target</label><select class="select" id="manual-target"><option value="">No target</option>${targets.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Amount</label><input class="input" id="manual-amount" type="number" min="0" max="99" value="1"></div>
        <div class="field"><label class="label">Keyword</label><select class="select" id="manual-keyword">${keywordOpts.map((k) => `<option>${k}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Power</label><input class="input" id="manual-power" type="number" value="1"></div>
        <div class="field"><label class="label">Health</label><input class="input" id="manual-health" type="number" value="1"></div>
        <div class="field full"><label class="label">Card name or ID (summon/create)</label><input class="input" id="manual-card" placeholder="e.g. Vilemaw or 01SI025"></div>
        <div class="field full"><label class="label">Note (log)</label><input class="input" id="manual-text" placeholder="Optional note for the table"></div>
        <div class="field full"><label class="check"><input type="checkbox" id="manual-round"> Apply only this round</label></div>
      </div>`,
    actions: [
      { label: 'Cancel', className: 'btn-ghost' },
      {
        label: 'Apply action', className: 'btn-primary', close: false, onClick: (modal, close) => {
          const get = (id) => modal.querySelector(id)?.value;
          const op = {
            type: get('#manual-op'),
            targetId: get('#manual-target') || undefined,
            amount: Number(get('#manual-amount') || 1),
            keyword: get('#manual-keyword'),
            power: Number(get('#manual-power') || 0),
            health: Number(get('#manual-health') || 0),
            cardId: /^[A-Za-z0-9_-]{3,}$/.test(get('#manual-card') || '') && !/\s/.test(get('#manual-card') || '') ? get('#manual-card') : undefined,
            name: get('#manual-card') || undefined,
            text: get('#manual-text') || '',
            duration: modal.querySelector('#manual-round')?.checked ? 'round' : 'permanent',
          };
          close();
          ctx.send('manual', { op });
        },
      },
    ],
  });
}

function openHelp() {
  openModal({
    title: 'How to play',
    subtitle: 'The short field guide',
    body: `<div class="stack small">
      <div><strong class="gold">Rounds & mana.</strong> Each round both teams gain one max mana gem and refill. Unspent mana becomes spell mana (max 3), used first for spells.</div>
      <div><strong class="gold">Priority & passing.</strong> The active team acts first. When both teams pass with no stack, the round ends. Fast and Burst spells can be played in response; Slow spells cannot be added to a stack.</div>
      <div><strong class="gold">Combat.</strong> Attack with any number of ready units. The defender assigns blockers, then both sides may play Fast spells. Unblocked attackers hit the Nexus. Quick Attack strikes first; Double Attack strikes twice; Overwhelm spills excess damage to the Nexus.</div>
      <div><strong class="gold">2v2 Team Clash.</strong> Teammates share a board, Nexus, mana pool, and attack token. Each player keeps their own hand, deck, and mulligan. Either teammate can act when the team has priority.</div>
      <div><strong class="gold">Format.</strong> 40-card decks, up to 3 copies of a card, at most 2 regions. Runeterra champions are neutral.</div>
      <div><strong class="gold">Unscripted cards.</strong> If a card’s text is not automated yet, use <em>Tabletop tools</em> to resolve it. The action is written to the game log for both players.</div>
      <div class="notice mt">Click a card in hand to play it. Right-click a hand card, or click any battlefield unit, to inspect it.</div>
    </div>`,
    actions: [{ label: 'Close', className: 'btn-primary' }],
  });
}

// ---------------------------------------------------------------- view helpers
function teamName(view, teamId) {
  return view.teams?.[teamId]?.name || `Team ${teamId}`;
}
function playerNamesHtml(players) {
  if (!players.length) return '<span class="lor-name muted">Waiting for a player</span>';
  return players.map((p) => `<span class="lor-player-name ${p.isYou ? 'you' : ''} ${p.connected === false ? 'offline' : ''}" title="${p.connected === false ? 'Disconnected' : 'Connected'}">${esc(p.name)}${p.isYou ? '<i>YOU</i>' : ''}${p.connected === false ? '<i class="offline-tag">OFFLINE</i>' : ''}</span>`).join('<span class="lor-name-sep">/</span>');
}
function initials(name) {
  const clean = String(name || '?').trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}
function handTotal(players) { return players.reduce((n, p) => n + (p.handCount || 0), 0); }
function deckTotal(players) { return players.reduce((n, p) => n + (p.deckCount || 0), 0); }
function teamSideClass(teamId) { return teamId === 'A' ? 'team-a' : 'team-b'; }

function avatarHtml(view, teamId, side) {
  const players = teamPlayers(view, teamId);
  const label = players.map((p) => p.name).join(' / ') || teamName(view, teamId);
  return `<div class="lor-avatar ${teamSideClass(teamId)} ${side}" title="${esc(label)}">${esc(initials(players[0]?.name || teamName(view, teamId)))}</div>`;
}

function sideInfoHtml(view, teamId, side, { own = false } = {}) {
  const team = view.teams[teamId];
  const players = team?.players || [];
  const hand = handTotal(players);
  const deck = deckTotal(players);
  return `<div class="lor-side-info ${side} ${own ? 'is-own' : ''}">
    ${avatarHtml(view, teamId, side)}
    <div class="lor-side-text">
      <div class="lor-side-caption">${own ? 'YOUR SIDE' : (view.you ? 'OPPONENT' : 'TOP SIDE')} · ${esc(teamId)}</div>
      <div class="lor-side-names">${playerNamesHtml(players)}</div>
      <div class="lor-side-meta"><span>${hand} in hand</span><span class="lor-meta-dot">·</span><span>${deck} in deck</span></div>
    </div>
  </div>`;
}

function nexusHtml(view, teamId, side) {
  const team = view.teams[teamId];
  const low = team.nexus <= Math.max(1, Math.floor(team.maxNexus * 0.25));
  const label = view.you
    ? (teamId === view.you.team ? 'YOUR NEXUS' : 'ENEMY NEXUS')
    : `${team.name.toUpperCase()} NEXUS`;
  return `<div class="lor-nexus ${side} ${teamSideClass(teamId)} ${low ? 'low' : ''}" title="${esc(team.name)} Nexus — ${team.nexus}/${team.maxNexus}">
    <div class="nexus-flare"></div>
    <div class="nexus-crystal"><span>${esc(team.nexus)}</span></div>
    <div class="nexus-caption">${esc(label)}</div>
  </div>`;
}

function enemyHandHtml(view, teamId) {
  const players = teamPlayers(view, teamId);
  const total = handTotal(players);
  const shown = Math.min(8, total);
  const backs = Array.from({ length: shown }, (_, i) => {
    const mid = (shown - 1) / 2;
    const rot = (i - mid) * 4.8;
    const lift = Math.abs(i - mid) * 2.4;
    return `<span class="lor-mini-back" style="--rot:${rot}deg;--lift:${lift}px;--z:${i}"></span>`;
  }).join('');
  return `<div class="lor-enemy-hand" title="Opponent hand — ${total} card${total === 1 ? '' : 's'}">
    <div class="lor-mini-backs">${backs || '<span class="lor-mini-back empty"></span>'}</div>
    <span class="lor-enemy-hand-count">${total}</span>
  </div>`;
}

function miniBacksHtml(count, className = '') {
  const shown = Math.min(8, Math.max(0, count));
  const backs = Array.from({ length: shown }, (_, i) => {
    const mid = (shown - 1) / 2;
    return `<span class="lor-mini-back" style="--rot:${(i - mid) * 5.2}deg;--lift:${Math.abs(i - mid) * 2.5}px;--z:${i}"></span>`;
  }).join('');
  return `<div class="lor-mini-backs ${className}">${backs || '<span class="lor-mini-back empty"></span>'}<span class="lor-enemy-hand-count">${count}</span></div>`;
}

function deckPile(view, teamId, side) {
  const players = teamPlayers(view, teamId);
  const total = deckTotal(players);
  const detail = players.map((p) => `${p.name}: ${p.deckCount}`).join(' · ');
  return `<div class="lor-deck ${side}" title="Cards remaining — ${esc(detail || `${total}`)}">
    <div class="lor-deck-stack"><i class="d3"></i><i class="d2"></i><i class="d1"><b>${total}</b><em>DECK</em></i></div>
  </div>`;
}

function manaCluster(view, teamId, side) {
  const team = view.teams[teamId];
  const max = Math.max(10, team.maxMana || 0);
  const pips = Array.from({ length: max }, (_, i) => {
    const filled = i < (team.mana || 0);
    const future = i >= (team.maxMana || 0);
    return `<span class="lor-mana-pip ${filled ? 'full' : ''} ${future ? 'future' : ''}" title="${filled ? 'Available mana' : future ? 'Locked mana gem' : 'Spent mana'}"></span>`;
  }).join('');
  const spellPips = Array.from({ length: 3 }, (_, i) => `<span class="lor-spell-pip ${i < (team.spellMana || 0) ? 'full' : ''}" title="Spell mana"></span>`).join('');
  const label = side === 'enemy' ? (view.you ? 'ENEMY MANA' : `${team.name.toUpperCase()} MANA`) : (view.you ? 'YOUR MANA' : `${team.name.toUpperCase()} MANA`);
  return `<div class="lor-mana ${side}">
    <div class="lor-mana-head"><span>${esc(label)}</span><b>${team.mana}<em>/${team.maxMana}</em></b></div>
    <div class="lor-mana-pips">${pips}</div>
    <div class="lor-spell-row"><span>SPELL</span><div class="lor-spell-pips">${spellPips}</div><b>${team.spellMana || 0}</b></div>
  </div>`;
}

function tokenHtml(view, myTeam) {
  if (!view.attackTokenTeam) return '';
  const mine = !!myTeam && view.attackTokenTeam === myTeam;
  const label = mine ? 'Your team holds the attack token' : (view.you ? 'The enemy team holds the attack token' : `${teamName(view, view.attackTokenTeam)} holds the attack token`);
  return `<div class="lor-token ${mine ? 'mine' : 'theirs'}" title="${esc(label)}">
    ${icon('swords')}<span>${mine ? 'YOUR TOKEN' : 'THEIR TOKEN'}</span>
  </div>`;
}

function boardRow(view, teamId, myTeam) {
  const team = view.teams[teamId];
  const isOwn = !!myTeam && teamId === myTeam;
  const combat = view.combat;
  const attackersSet = new Set(combat?.attackers || []);
  const blockedSet = new Set(Object.values(combat?.blockMap || {}));
  const units = team?.board || [];
  const slots = [];
  for (const u of units) {
    const selected = isOwn && attackMode && selectedAttackers.has(u.uid);
    const canPick = isOwn && attackMode && u.canAttack;
    const classes = [
      selected ? 'attack-selected' : '',
      canPick ? 'attack-selectable' : '',
      u.canBlock ? 'ready-blocker' : '',
      isOwn && attackMode && !u.canAttack ? 'cannot-attack' : '',
    ].filter(Boolean).join(' ');
    slots.push(`<div class="lor-unit-slot filled">${unitHtml(u, {
      selected,
      attacker: attackersSet.has(u.uid),
      blocker: blockedSet.has(u.uid),
      dim: isOwn && attackMode && !u.canAttack,
      className: classes,
      attrs: `data-game-unit="${esc(u.uid)}"`,
    })}</div>`);
  }
  for (let i = units.length; i < (view.settings?.rules?.boardMax || 6); i++) slots.push('<div class="lor-unit-slot empty" aria-hidden="true"></div>');
  return `<div class="lor-half ${isOwn ? 'own' : 'enemy'}">${slots.join('')}</div>`;
}

function stateLine(view, myTeam) {
  if (view.winner) return 'Table decided';
  if (view.phase === 'mulligan') return 'Choose your opening hand';
  if (view.pending) return view.pending.waiting ? `Waiting on ${view.pending.playerName}` : 'Choose a target';
  if (view.combat?.stage === 'blockers') {
    return view.legal?.canBlock ? 'Assign blockers' : 'Opponent is blocking';
  }
  if (view.combat?.stage === 'spells') return 'Combat · fast spells';
  if (view.stack?.length) return `Spell stack · ${view.stack.length}`;
  if (view.legal?.canAct) return 'Your move';
  if (myTeam && view.priorityTeam === myTeam) return 'Resolve the board';
  const team = view.priorityTeam ? view.teams[view.priorityTeam] : null;
  return team ? `${team.name} is acting` : phaseName(view);
}

function attackHint(view, myTeam) {
  if (attackMode) return 'Choose attackers on your board';
  if (view.phase === 'combat' && view.combat?.stage === 'blockers') return view.legal?.canBlock ? 'Declare blockers or no blocks' : 'Waiting for the defender';
  if (view.stack?.length) return 'Respond or pass';
  if (view.legal?.canAct) return 'Play a card or pass';
  if (view.pending) return 'Resolve the pending choice';
  return 'Waiting for the opponent';
}

function stackHtml(view) {
  if (!view.stack?.length) return '';
  return `<div class="lor-stack-panel" aria-label="Spell stack">
    <div class="lor-stack-title"><span>SPELL STACK</span><b>${view.stack.length}</b></div>
    <div class="lor-stack-cards">
      ${view.stack.map((s) => `<button type="button" class="lor-stack-card" data-stack-card="${esc(s.cardId)}" title="${esc(s.name)} — ${esc(s.speed || 'Spell')}">
        <img src="/art/${encodeURIComponent(s.cardId)}" alt="" loading="lazy">
        <span class="stack-shade"></span>
        <strong>${esc(s.name)}</strong>
        <em>${esc(s.speed || 'Spell')}</em>
      </button>`).join('')}
    </div>
  </div>`;
}

function handPanel(view, ctx, root) {
  if (!view.you) return '<div class="lor-hand lor-hand-empty"><span>SPECTATING</span><small>Hands are hidden</small></div>';
  const hand = view.you.hand || [];
  if (!hand.length) return '<div class="lor-hand lor-hand-empty"><span>NO CARDS IN HAND</span><small>The next draw is yours</small></div>';
  const playable = new Set(view.legal?.playable || []);
  const n = hand.length;
  const overlap = n <= 5 ? 18 : n <= 7 ? 36 : n <= 9 ? 50 : 58;
  const spread = n <= 1 ? 0 : Math.min(4.6, 23 / n);
  return `<div class="lor-hand" style="--overlap:${overlap}px">
    ${hand.map((h, i) => {
      if (h.hidden) return `<div class="lor-hand-slot hidden-card">${cardHtml({ hidden: true }, { attrs: 'data-hand-card=""' })}</div>`;
      const card = cardById(h.id) || h;
      const isPlayable = playable.has(h.iid);
      const rot = (i - (n - 1) / 2) * spread;
      const lift = Math.abs(i - (n - 1) / 2) * 3.4;
      return `<div class="lor-hand-slot ${isPlayable ? 'is-playable' : ''}" style="--rot:${rot.toFixed(2)}deg;--lift:${lift.toFixed(1)}px;z-index:${10 + i}" data-hand-slot="${esc(h.iid)}">
        ${cardHtml(card, {
          iid: h.iid,
          selected: false,
          playable: isPlayable,
          dim: !isPlayable,
          badge: h.fleeting ? 'Fleeting' : '',
          badgeClass: 'manual',
          attrs: `data-hand-card="${esc(h.iid)}"`,
        })}
      </div>`;
    }).join('')}
  </div>`;
}

function logGroupsHtml(view) {
  const log = view.log || [];
  if (!log.length) return '<div class="history-empty">The chronicle begins when the first card is played.</div>';
  const groups = new Map();
  for (const line of log) {
    const round = Number.isFinite(Number(line.round)) ? Number(line.round) : view.round;
    if (!groups.has(round)) groups.set(round, []);
    groups.get(round).push(line);
  }
  return [...groups.keys()].sort((a, b) => b - a).map((round) => {
    const lines = groups.get(round);
    const setup = !(round > 0);
    return `<section class="history-round ${round === view.round && !setup ? 'current' : ''} ${setup ? 'setup' : ''}">
      <div class="history-round-head"><span>${setup ? 'SETUP' : `ROUND ${round}`}</span><small>${lines.length} event${lines.length === 1 ? '' : 's'}</small></div>
      <div class="history-log">${lines.map(normalizeLogLine).join('')}</div>
    </section>`;
  }).join('');
}

function historyDrawer(view) {
  const rounds = new Set((view.log || []).filter((l) => Number(l.round) > 0).map((l) => l.round)).size;
  return `<div class="history-scrim ${historyOpen ? 'open' : ''}" id="history-scrim" aria-hidden="true"></div>
  <aside class="lor-history-drawer ${historyOpen ? 'open' : ''}" id="game-history-drawer" aria-label="Round history" aria-hidden="${historyOpen ? 'false' : 'true'}">
    <header class="history-head">
      <div><div class="history-kicker">BATTLE RECORD</div><h2>Round History</h2><p>${rounds} round${rounds === 1 ? '' : 's'} · ${view.log?.length || 0} events</p></div>
      <button type="button" class="lor-icon-btn" id="history-close" aria-label="Close round history">${icon('close')}</button>
    </header>
    <div class="history-scroll">${logGroupsHtml(view)}</div>
    <footer class="history-foot">Every play, strike, and ruling is recorded here.</footer>
  </aside>`;
}

function mulliganScreen(view, state) {
  const myTeam = view.you?.team || 'A';
  const enemyTeam = otherTeam(myTeam);
  const youPlayer = teamPlayers(view, myTeam).find((p) => p.isYou);
  const ready = !!youPlayer?.mulliganReady;
  const players = [...teamPlayers(view, 'A'), ...teamPlayers(view, 'B')];
  const hand = view.you?.hand || [];
  const willActFirst = view.attackTokenTeam === myTeam || view.activeTeam === myTeam;
  const opponentHandCount = handTotal(teamPlayers(view, enemyTeam));
  const titleSide = view.you ? (willActFirst ? 'YOU WILL ACT FIRST' : 'YOU WILL GO SECOND') : 'WAITING FOR PLAYERS';
  const readyRows = players.map((p) => `<div class="ready-row ${p.mulliganReady ? 'ready' : ''} ${p.isYou ? 'you' : ''}">
    <span class="ready-dot">${p.mulliganReady ? icon('check') : ''}</span>
    <span class="ready-name">${esc(p.name)}${p.isYou ? ' <i>you</i>' : ''}</span>
    <span class="ready-state">${p.mulliganReady ? 'READY' : 'CHOOSING'}</span>
  </div>`).join('');

  const cards = view.you ? hand.map((h) => {
    const card = cardById(h.id) || h;
    const selected = mulliganSelected.has(h.iid);
    return `<div class="mulligan-slot ${selected ? 'selected' : ''}" data-mulligan-slot="${esc(h.iid)}">
      <div class="mulligan-card-wrap">
        ${cardHtml(card, {
          iid: h.iid,
          selected,
          className: 'mulligan-card',
          attrs: `data-hand-card="${esc(h.iid)}" data-mulligan-card="1"`,
        })}
        ${selected ? '<span class="mulligan-badge">REPLACING</span>' : ''}
      </div>
      <button type="button" class="mulligan-replace ${selected ? 'undo' : ''}" data-mulligan-toggle="${esc(h.iid)}">${selected ? 'UNDO' : 'REPLACE'}</button>
    </div>`;
  }).join('') : '';

  const waiting = view.you && ready;
  const waitingPanel = waiting ? `<div class="mulligan-wait">
    <div class="mulligan-wait-panel">
      <div class="mulligan-spinner"></div>
      <div class="mulligan-wait-kicker">STARTING HAND LOCKED</div>
      <h2>Waiting for the table</h2>
      <p>Your opening hand is ready. The battle begins when every player has locked in.</p>
      <div class="mulligan-ready-list">${readyRows}</div>
    </div>
  </div>` : '';

  const spectatorPanel = !view.you ? `<div class="mulligan-wait">
    <div class="mulligan-wait-panel">
      <div class="mulligan-wait-kicker">MATCH START</div>
      <h2>Mulligan in progress</h2>
      <p>Both sides are choosing their opening hands. The board will be revealed when the table is ready.</p>
      <div class="mulligan-ready-list">${readyRows}</div>
    </div>
  </div>` : '';

  return `<div class="mulligan-screen">
    <div class="mulligan-atmosphere"></div>
    <header class="mulligan-top">
      <div class="mulligan-opponent">
        ${avatarHtml(view, enemyTeam, 'enemy')}
        <div><span class="mulligan-label">OPPONENT</span><div class="mulligan-names">${playerNamesHtml(teamPlayers(view, enemyTeam))}</div></div>
      </div>
      <div class="mulligan-room">
        <span>ROOM ${esc(state.gameRoom?.code || '—')}</span>
        <b>${view.mode === '2v2' ? '2v2 TEAM CLASH' : '1v1 DUEL'}</b>
        <button type="button" class="mulligan-leave" id="mulligan-leave">Leave table</button>
      </div>
      <div class="mulligan-opponent-hand">${miniBacksHtml(opponentHandCount)}<span>THEIR HAND</span></div>
    </header>

    <div class="mulligan-heading">
      <div class="mulligan-kicker">MATCH START</div>
      <h1>Starting Hand</h1>
      <p>CHOOSE CARDS TO REPLACE</p>
    </div>

    <div class="mulligan-cards ${view.you ? '' : 'spectator'}">
      ${cards || (view.you ? '<div class="mulligan-no-cards">Your opening hand is empty.</div>' : '<div class="mulligan-spectator-mark">' + icon('flame') + '<span>NO HAND TO CHOOSE</span></div>')}
    </div>

    <footer class="mulligan-footer">
      <div class="mulligan-turn">
        <span>${esc(titleSide)}</span>
        <small>${view.you ? (mulliganSelected.size ? `${mulliganSelected.size} card${mulliganSelected.size === 1 ? '' : 's'} marked for replacement` : 'Keep your hand or mark cards to replace') : 'The table is choosing opening hands'}</small>
      </div>
      <div class="mulligan-progress">
        ${players.map((p) => `<span class="mulligan-progress-dot ${p.mulliganReady ? 'ready' : ''}" title="${esc(p.name)}: ${p.mulliganReady ? 'ready' : 'choosing'}"></span>`).join('')}
      </div>
      ${view.you && !ready ? `<button type="button" class="mulligan-ok" id="mulligan-ok" aria-label="Lock in starting hand"><span>OK</span><small>LOCK IN</small></button>` : `<div class="mulligan-waiting-label">${ready ? 'LOCKED IN' : 'SPECTATING'}</div>`}
    </footer>
    ${waitingPanel}
    ${spectatorPanel}
  </div>`;
}

function roundSplashHtml(view) {
  if (!splashRound || Date.now() > splashUntil || view.phase === 'mulligan') return '';
  const active = view.activeTeam ? view.teams[view.activeTeam] : null;
  return `<div class="lor-round-splash" aria-hidden="true">
    <div class="round-splash-rule"></div>
    <div class="round-splash-kicker">ROUND</div>
    <div class="round-splash-number">${esc(splashRound)}</div>
    <div class="round-splash-sub">${esc(active ? `${active.name} takes the first move` : 'The table is set')}</div>
  </div>`;
}

function gameOverHtml(view, state, ctx) {
  if (!view.winner) return '';
  const myTeam = view.you?.team;
  const won = myTeam && view.winner === myTeam;
  const title = myTeam ? (won ? 'Victory' : 'Defeat') : `${teamName(view, view.winner)} Wins`;
  const isHost = !!state.gameRoom && state.gameRoom.hostId === state.clientId;
  const me = myTeam ? (view.teams?.[myTeam]?.players || []).find((p) => p.isYou) : null;
  const stats = view.you?.stats || me?.stats || {};
  return `<div class="lor-gameover ${won ? 'won' : (myTeam ? 'lost' : 'neutral')}">
    <div class="gameover-rays"></div>
    <div class="gameover-inner">
      <div class="gameover-kicker">${myTeam ? (won ? 'THE NEXUS FALLS' : 'THE NEXUS BREAKS') : 'THE TABLE HAS DECIDED'}</div>
      <h1>${esc(title)}</h1>
      <p class="gameover-reason">${esc(view.winReason || `${teamName(view, view.winner)} took the Nexus.`)}</p>
      <div class="gameover-stats">
        <div><strong>${view.round}</strong><span>Rounds</span></div>
        <div><strong>${Number(stats.cardsPlayed || 0)}</strong><span>Cards played</span></div>
        <div><strong>${Number(stats.damageToEnemyNexus || 0)}</strong><span>Nexus damage</span></div>
        <div><strong>${Number(stats.unitsKilled || 0)}</strong><span>Units slain</span></div>
      </div>
      <div class="gameover-actions">
        ${isHost ? `<button class="btn btn-primary btn-lg" id="game-rematch">Rematch</button>` : (myTeam ? '<span class="gameover-note">The host can start a rematch</span>' : '')}
        <button class="btn btn-ghost btn-lg" id="game-leave-over">Leave table</button>
      </div>
    </div>
  </div>`;
}

function pendingPanel(view, ctx) {
  const pending = view.pending;
  if (!pending) return '';
  if (pending.waiting) return `<div class="target-panel"><div class="target-head"><strong>${esc(pending.playerName)} is choosing…</strong><span class="tag">Waiting</span></div><div class="small muted">${esc(pending.prompt || '')}</div></div>`;
  const options = pending.options || [];
  return `<div class="target-panel" id="pending-panel">
    <div class="target-head"><strong>${esc(pending.prompt || 'Choose a target')}</strong><span class="tag">${choiceSelected.size}/${pending.max || 1}</span></div>
    <div class="target-chips">${options.map((o) => `<button class="target-chip ${choiceSelected.has(o.id) ? 'selected' : ''} ${o.kind === 'nexus' ? 'nexus' : ''}" type="button" data-choice-id="${esc(o.id)}">${esc(o.label)}</button>`).join('')}</div>
    <div class="row between mt"><span class="target-hint">Choose ${pending.min || 1}${pending.max && pending.max !== pending.min ? `–${pending.max}` : ''}.</span><button class="btn btn-primary btn-sm" id="choice-confirm">Confirm</button></div>
  </div>`;
}

function openGameMenu(view, state, ctx, root) {
  const isHost = !!state.gameRoom && state.gameRoom.hostId === state.clientId;
  const code = state.gameRoom?.code || state.roomCode || '';
  openModal({
    title: 'Table menu',
    subtitle: code ? `Room ${code} · ${view.mode === '2v2' ? '2v2 Team Clash' : '1v1 Duel'}` : 'Nexus Forge',
    narrow: true,
    body: `<div class="lor-menu-list">
      ${view.you ? `<button type="button" class="lor-menu-row" data-menu="manual"><span class="lor-menu-icon">${icon('cards')}</span><span><strong>Tabletop tools</strong><small>Resolve unscripted cards manually</small></span></button>` : ''}
      <button type="button" class="lor-menu-row" data-menu="history"><span class="lor-menu-icon">${icon('history')}</span><span><strong>Round history</strong><small>Review the battle log by round</small></span></button>
      <button type="button" class="lor-menu-row" data-menu="rules"><span class="lor-menu-icon">${icon('help')}</span><span><strong>Rules reference</strong><small>Rounds, priority, combat, and formats</small></span></button>
      ${code ? `<button type="button" class="lor-menu-row" data-menu="copy"><span class="lor-menu-icon">${icon('cards')}</span><span><strong>Copy invite code</strong><small>${esc(code)} · share this table</small></span></button>` : ''}
      <button type="button" class="lor-menu-row" data-menu="fullscreen"><span class="lor-menu-icon">${icon('menu')}</span><span><strong>Toggle fullscreen</strong><small>Focus on the board</small></span></button>
      ${view.you && view.phase !== 'gameover' ? `<button type="button" class="lor-menu-row danger" data-menu="surrender"><span class="lor-menu-icon">${icon('flame')}</span><span><strong>Surrender</strong><small>Concede the match</small></span></button>` : ''}
      <button type="button" class="lor-menu-row danger" data-menu="leave"><span class="lor-menu-icon">${icon('close')}</span><span><strong>Leave table</strong><small>${isHost ? 'Host leaves the room' : 'Return to the home screen'}</small></span></button>
    </div>`,
    actions: [{ label: 'Resume', className: 'btn-primary' }],
    onOpen: (modal, close) => {
      modal.querySelector('[data-menu="manual"]')?.addEventListener('click', () => { close(); openManualTools(view, ctx); });
      modal.querySelector('[data-menu="history"]')?.addEventListener('click', () => { historyOpen = true; close(); renderGame(root, ctx); });
      modal.querySelector('[data-menu="rules"]')?.addEventListener('click', () => openHelp());
      modal.querySelector('[data-menu="copy"]')?.addEventListener('click', async () => {
        await ctx.copyText(code);
        toast('Invite code copied.', 'success');
      });
      modal.querySelector('[data-menu="fullscreen"]')?.addEventListener('click', async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await document.documentElement.requestFullscreen();
          close();
        } catch { toast('Fullscreen is not available in this browser.', 'error'); }
      });
      modal.querySelector('[data-menu="surrender"]')?.addEventListener('click', async () => {
        close();
        const ok = await modalConfirm('Surrender?', 'The enemy team will be declared the winner.', { danger: true, confirmLabel: 'Surrender' });
        if (ok) ctx.send('surrender');
      });
      modal.querySelector('[data-menu="leave"]')?.addEventListener('click', async () => {
        close();
        const ok = await modalConfirm('Leave the table?', 'If the game is still running, your side will surrender. Your seat will be removed from the room.', { danger: true, confirmLabel: 'Leave' });
        if (ok) ctx.leaveRoom();
      });
    },
  });
}

function netOverlayHtml(state) {
  if (!state.desktop) return '';
  const net = state.net || {};
  if (net.role === 'guest' && (net.status === 'reconnecting' || net.status === 'joining')) {
    const attempt = Math.min(Math.max(Number(net.retries) || 1, 1), 4);
    return `<div class="net-overlay" role="alertdialog" aria-modal="true" aria-labelledby="net-overlay-title">
      <div class="net-overlay-panel">
        <div class="net-spinner" aria-hidden="true"></div>
        <div class="net-overlay-kicker">CONNECTION INTERRUPTED</div>
        <h2 id="net-overlay-title">Reconnecting to the host</h2>
        <p>Your seat is held for two minutes. Reconnect attempt ${attempt} of 4.</p>
        <button class="btn btn-ghost" id="net-cancel-reconnect">Cancel and leave</button>
      </div>
    </div>`;
  }
  if (net.role === 'guest' && net.status === 'connected' && net.signalingLost) {
    return '<div class="net-signal-note" role="status">Signaling is unavailable, but your current match is still connected.</div>';
  }
  return '';
}

export function renderGame(root, ctx) {
  const { state } = ctx;
  const view = state.game;
  if (!view) {
    root.innerHTML = '<div class="lor-game"><div class="boot"><div class="boot-title">The table is quiet.</div><button class="btn btn-primary" id="game-return-home">Return home</button></div></div>';
    root.querySelector('#game-return-home')?.addEventListener('click', () => ctx.navigate('#/'));
    return;
  }

  if (view.id !== gameId) {
    gameId = view.id;
    mulliganSelected = new Set();
    attackMode = false;
    selectedAttackers = new Set();
    choiceSelected = new Set();
    choiceKey = '';
    historyOpen = false;
    lastRoundSeen = 0;
    splashRound = null;
    splashUntil = 0;
  }
  if (view.phase !== 'mulligan') mulliganSelected = new Set();
  if (view.pending) {
    const key = `${view.pending.playerId}|${view.pending.prompt}|${(view.pending.options || []).map((o) => o.id).join(',')}`;
    if (key !== choiceKey) { choiceKey = key; choiceSelected = new Set(); }
  } else {
    choiceKey = '';
    choiceSelected = new Set();
  }
  if (attackMode && !view.legal?.canAttack) { attackMode = false; selectedAttackers = new Set(); }
  if (attackMode) {
    const legalIds = new Set((view.teams[view.you?.team]?.board || []).filter((u) => u.canAttack).map((u) => u.uid));
    selectedAttackers = new Set([...selectedAttackers].filter((uid) => legalIds.has(uid)));
  }
  if (view.phase !== 'mulligan' && view.phase !== 'gameover' && view.round !== lastRoundSeen) {
    lastRoundSeen = view.round;
    splashRound = view.round;
    splashUntil = Date.now() + 2850;
  }

  const myTeam = myTeamOf(view);
  const viewingTeam = myTeam || 'A';
  const enemyTeam = otherTeam(viewingTeam);
  const my = view.teams[viewingTeam];
  const enemy = view.teams[enemyTeam];
  const isMulligan = view.phase === 'mulligan';
  const canAct = !!view.legal?.canAct;
  const canAttack = !!view.legal?.canAttack;
  const canBlock = !!view.legal?.canBlock;
  const priorityIsMine = !!myTeam && view.priorityTeam === myTeam;
  const spectator = !view.you;
  const passDisabled = !(canAct || canBlock);
  const passLabel = canBlock ? 'NO BLOCKS' : canAct ? 'PASS' : 'WAIT';
  const passSub = canBlock ? 'Decline blockers' : (canAct ? (view.phase === 'combat' ? (view.stack?.length ? 'Resolve stack' : 'Resolve combat') : 'End your move') : (priorityIsMine ? 'Resolve choice' : 'Opponent turn'));
  const status = stateLine(view, myTeam);
  const statusMine = canAct || canBlock;
  const roundsLogged = new Set((view.log || []).filter((l) => Number(l.round) > 0).map((l) => l.round)).size;
  const roomCode = state.gameRoom?.code || state.roomCode || '';
  const phaseLabel = view.phase === 'combat' ? (view.combat?.stage === 'blockers' ? 'BLOCK STEP' : 'FAST SPELLS') : view.phase === 'gameover' ? 'GAME OVER' : view.phase === 'mulligan' ? 'MULLIGAN' : 'BATTLE';
  const myPlayers = teamPlayers(view, viewingTeam);
  const enemyPlayers = teamPlayers(view, enemyTeam);

  root.innerHTML = `<div class="lor-game ${spectator ? 'spectating' : ''} phase-${esc(view.phase)}" data-round="${view.round}">
    <div class="lor-arena-bg"></div>
    <div class="lor-vignette"></div>
    <div class="lor-grain"></div>

    <div class="lor-top-utils">
      <span class="lor-round-chip"><b>ROUND ${view.round}</b><em>${esc(phaseLabel)}</em></span>
      <button type="button" class="lor-icon-btn" id="game-help" title="Rules reference" aria-label="Rules reference">${icon('help')}</button>
      <button type="button" class="lor-icon-btn" id="game-menu" title="Table menu" aria-label="Table menu">${icon('menu')}</button>
    </div>

    ${isMulligan ? '' : enemyHandHtml(view, enemyTeam)}
    ${isMulligan ? '' : `<div class="lor-phase-line ${statusMine ? 'mine' : ''}">
      <span class="phase-dot"></span>
      <span>${esc(status)}</span>
      ${spectator ? '<b class="spectator-chip">SPECTATING</b>' : ''}
      ${roomCode ? `<b class="room-chip">${esc(roomCode)}</b>` : ''}
    </div>`}

    <aside class="lor-left-rail">
      ${sideInfoHtml(view, enemyTeam, 'enemy')}
      ${nexusHtml(view, enemyTeam, 'enemy')}
      <button type="button" class="lor-history-btn ${historyOpen ? 'open' : ''}" id="game-history" aria-expanded="${historyOpen ? 'true' : 'false'}" aria-controls="game-history-drawer" title="Open round history">
        <span class="history-icon">${icon('history')}</span>
        <span class="history-copy"><b>HISTORY</b><small>${roundsLogged} round${roundsLogged === 1 ? '' : 's'}</small></span>
      </button>
      ${nexusHtml(view, viewingTeam, 'own')}
      ${sideInfoHtml(view, viewingTeam, 'own', { own: true })}
    </aside>

    <aside class="lor-right-rail">
      <section class="lor-resource enemy">
        ${deckPile(view, enemyTeam, 'enemy')}
        ${manaCluster(view, enemyTeam, 'enemy')}
      </section>

      <section class="lor-actions">
        ${tokenHtml(view, myTeam)}
        ${canBlock ? `<button type="button" class="lor-side-action block" id="game-block">${icon('shield')}<span>BLOCK</span></button>` : ''}
        ${canAttack && !attackMode ? `<button type="button" class="lor-side-action attack" id="game-attack">${icon('swords')}<span>ATTACK</span></button>` : ''}
        ${!attackMode ? `<button type="button" class="lor-pass ${canAct ? 'ready' : ''}" id="game-pass" ${passDisabled ? 'disabled' : ''} title="${esc(passDisabled ? 'Waiting for priority' : passSub)}">
          <span class="pass-orbit"></span>
          <span class="pass-main">${esc(passLabel)}</span>
          <span class="pass-sub">${esc(passSub)}</span>
        </button>` : `<div class="lor-attack-confirm">
          <div class="attack-confirm-head"><span>ATTACKERS</span><b>${selectedAttackers.size}</b></div>
          <p>Choose units on your side, then confirm.</p>
          <button type="button" class="btn btn-primary btn-sm" id="attack-confirm" ${selectedAttackers.size ? '' : 'disabled'}>${icon('swords')} Attack</button>
          <button type="button" class="btn btn-ghost btn-sm" id="attack-cancel">Cancel</button>
        </div>`}
        <div class="lor-action-hint">${esc(attackHint(view, myTeam))}</div>
      </section>

      <section class="lor-resource own">
        ${manaCluster(view, viewingTeam, 'own')}
        ${deckPile(view, viewingTeam, 'own')}
      </section>
    </aside>

    <main class="lor-board">
      ${boardRow(view, enemyTeam, myTeam)}
      <div class="lor-divider">
        <span class="divider-line"></span>
        <div class="lor-round-medallion ${view.combat ? 'combat' : ''}"><span>${view.combat ? icon('swords') : 'ROUND'}</span><b>${view.round}</b></div>
        <span class="divider-line"></span>
      </div>
      ${boardRow(view, viewingTeam, myTeam)}
    </main>

    ${stackHtml(view)}
    ${handPanel(view, ctx, root)}
    ${historyDrawer(view)}
    ${pendingPanel(view, ctx)}
    ${roundSplashHtml(view)}
    ${isMulligan ? mulliganScreen(view, state) : ''}
    ${gameOverHtml(view, state, ctx)}
    ${netOverlayHtml(state)}
  </div>`;

  // ---------------------------------------------------------------- interactions
  const toggleMulligan = (iid) => {
    const youPlayer = teamPlayers(view, myTeam).find((p) => p.isYou);
    if (youPlayer?.mulliganReady) return;
    if (mulliganSelected.has(iid)) mulliganSelected.delete(iid); else mulliganSelected.add(iid);
    renderGame(root, ctx);
  };
  const inspectHandCard = (iid) => {
    const h = (view.you?.hand || []).find((x) => x.iid === iid);
    if (h) openCardDetails(cardById(h.id) || h);
  };
  const handClick = (iid) => {
    const handCard = (view.you?.hand || []).find((h) => h.iid === iid);
    if (!handCard) return;
    if (isMulligan) { toggleMulligan(iid); return; }
    if (view.pending) { toast('Resolve the pending choice first.', 'error'); return; }
    if (view.phase === 'gameover') return;
    playCard(iid, view, ctx, root);
  };
  root.querySelectorAll('[data-hand-card]').forEach((el) => {
    const iid = el.dataset.handCard;
    if (!iid) return;
    el.addEventListener('click', (e) => { e.stopPropagation(); handClick(iid); });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); inspectHandCard(iid); });
  });
  root.querySelectorAll('[data-mulligan-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleMulligan(btn.dataset.mulliganToggle); });
  });
  root.querySelector('#mulligan-ok')?.addEventListener('click', () => ctx.send('mulligan', { iids: [...mulliganSelected] }));
  root.querySelectorAll('[data-game-unit]').forEach((el) => {
    el.addEventListener('click', () => {
      const u = findUnit(view, el.dataset.gameUnit);
      if (!u) return;
      if (attackMode && u.team === myTeam && u.canAttack) {
        if (selectedAttackers.has(u.uid)) selectedAttackers.delete(u.uid); else selectedAttackers.add(u.uid);
        renderGame(root, ctx);
        return;
      }
      openCardDetails(cardById(u.cardId) || u, {
        html: `<div class="notice mt small">${esc(u.name)} · ${u.power}|${u.health}${u.statuses?.barrier ? ' · Barrier' : ''}${u.statuses?.stunned ? ' · Stunned' : ''}${u.statuses?.frostbitten ? ' · Frostbitten' : ''}</div>`,
      });
    });
  });
  root.querySelectorAll('[data-stack-card]').forEach((el) => {
    el.addEventListener('click', () => openCardDetails(cardById(el.dataset.stackCard)));
  });
  root.querySelector('#game-pass')?.addEventListener('click', () => ctx.send('pass'));
  root.querySelector('#game-block')?.addEventListener('click', () => openBlockModal(view, ctx, root));
  root.querySelector('#game-attack')?.addEventListener('click', () => {
    if (!canAttack) return;
    attackMode = true;
    selectedAttackers = new Set();
    renderGame(root, ctx);
  });
  root.querySelector('#attack-confirm')?.addEventListener('click', () => {
    if (!selectedAttackers.size) { toast('Choose at least one attacker.', 'error'); return; }
    ctx.send('attack', { attackers: [...selectedAttackers] });
    attackMode = false;
    selectedAttackers = new Set();
  });
  root.querySelector('#attack-cancel')?.addEventListener('click', () => { attackMode = false; selectedAttackers = new Set(); renderGame(root, ctx); });
  root.querySelector('#game-history')?.addEventListener('click', () => { historyOpen = !historyOpen; renderGame(root, ctx); });
  root.querySelector('#history-close')?.addEventListener('click', () => { historyOpen = false; renderGame(root, ctx); });
  root.querySelector('#history-scrim')?.addEventListener('click', () => { historyOpen = false; renderGame(root, ctx); });
  root.querySelector('#game-help')?.addEventListener('click', openHelp);
  root.querySelector('#game-menu')?.addEventListener('click', () => openGameMenu(view, state, ctx, root));
  root.querySelector('#net-cancel-reconnect')?.addEventListener('click', () => ctx.cancelReconnect());
  root.querySelector('#mulligan-leave')?.addEventListener('click', async () => {
    const ok = await modalConfirm('Leave the table?', 'Your seat will be removed from the room.', { danger: true, confirmLabel: 'Leave' });
    if (ok) ctx.leaveRoom();
  });

  root.querySelectorAll('[data-choice-id]').forEach((btn) => btn.addEventListener('click', () => {
    const id = btn.dataset.choiceId;
    const pending = view.pending;
    if (!pending || pending.waiting) return;
    const max = pending.max || 1;
    if (max === 1) choiceSelected = new Set([id]);
    else if (choiceSelected.has(id)) choiceSelected.delete(id);
    else if (choiceSelected.size < max) choiceSelected.add(id);
    root.querySelectorAll('[data-choice-id]').forEach((b) => b.classList.toggle('selected', choiceSelected.has(b.dataset.choiceId)));
    const tag = root.querySelector('#pending-panel .tag');
    if (tag) tag.textContent = `${choiceSelected.size}/${max}`;
  }));
  root.querySelector('#choice-confirm')?.addEventListener('click', () => {
    const pending = view.pending;
    if (!pending || pending.waiting) return;
    const min = pending.min || 1;
    if (choiceSelected.size < min) { toast(`Choose ${min} target${min === 1 ? '' : 's'}.`, 'error'); return; }
    ctx.send('choice', { ids: [...choiceSelected] });
  });

  root.querySelector('#game-rematch')?.addEventListener('click', () => {
    ctx.send('rematch');
    toast('Rematch requested. Waiting for the table…', 'gold');
  });
  root.querySelector('#game-leave-over')?.addEventListener('click', async () => {
    const ok = await modalConfirm('Leave the table?', 'Your seat will be removed from the room.', { danger: true, confirmLabel: 'Leave' });
    if (ok) ctx.leaveRoom();
  });

  if (historyOpen) {
    const scroll = root.querySelector('.history-scroll');
    if (scroll) scroll.scrollTop = 0;
  }
}
