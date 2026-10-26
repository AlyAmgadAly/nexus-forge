import {
  canonicalKeyword, cleanKeywords, clamp, mulberry32, shuffle, otherTeam,
} from './constants.js';
import {
  EffectRunner, targetSpecsForScript, targetNeedsChoice, normalizeTarget, evalCondition,
  targetOptions, autoTargetIds, resolveEntity, promptForTarget,
} from './effects.js';

const DEFAULT_RULES = {
  deckSize: 40,
  maxCopies: 3,
  maxRegions: 2,
  handStart: 4,
  handMax: 10,
  boardMax: 6,
  nexus1v1: 20,
  nexus2v2: 40,
  spellManaCap: 3,
  maxMana: 10,
};

function cardView(card) {
  if (!card) return null;
  return {
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
    keywords: card.keywords,
    text: card.text,
    levelup: card.levelup,
    flavor: card.flavor,
    set: card.set,
    spellSpeed: card.spellSpeed,
    art: card.art,
    fullArt: card.fullArt,
    scriptStatus: card.scriptStatus,
    targetSpecs: card.script ? targetSpecsForScript(card.script) : [],
  };
}

export class Game {
  constructor({ id, mode = '1v1', players, decks, cardDB, settings = {}, seed = Date.now(), onUpdate = null }) {
    this.id = id || `game-${seed}`;
    this.mode = mode;
    this.cardDB = cardDB;
    this.settings = settings;
    this.rules = { ...DEFAULT_RULES, ...(settings.rules || {}) };
    this.rng = mulberry32(seed >>> 0);
    this.onUpdate = onUpdate;
    this.round = 0;
    this.phase = 'mulligan';
    this.winner = null;
    this.winReason = '';
    this.priorityTeam = null;
    this.activeTeam = null;
    this.attackTokenTeam = null;
    this.passed = new Set();
    this.stack = [];
    this.stackSeq = 0;
    this.combat = null;
    this.pending = null;
    this.manual = null;
    this.resolutionStack = [];
    this.pumping = false;
    this.uidSeq = 0;
    this.iidSeq = 0;
    this.logSeq = 0;
    this.logs = [];
    this.teams = {
      A: this.makeTeam('A', mode === '2v2' ? this.rules.nexus2v2 : this.rules.nexus1v1, mode === '2v2' ? 2 : 20),
      B: this.makeTeam('B', mode === '2v2' ? this.rules.nexus2v2 : this.rules.nexus1v1, mode === '2v2' ? 2 : 20),
    };
    // Starting max mana: 0 for 1v1 (round 1 brings it to 1), 1 for 2v2 (round 1 brings it to 2).
    this.teams.A.maxMana = mode === '2v2' ? 1 : 0;
    this.teams.B.maxMana = mode === '2v2' ? 1 : 0;
    this.teams.A.mana = 0;
    this.teams.B.mana = 0;
    this.players = new Map();
    this.effects = new EffectRunner(this);
    this.lastAction = null;
    this.setup(players, decks);
  }

  makeTeam(id, nexus, maxNexus) {
    return {
      id,
      name: id === 'A' ? 'Team A' : 'Team B',
      nexus,
      maxNexus,
      board: [],
      mana: 0,
      spellMana: 0,
      maxMana: 0,
      attackToken: false,
      hasAttacked: false,
      scoutUsed: false,
      plunderedThisRound: false,
      cardsPlayedThisRound: 0,
      spellsPlayedThisRound: 0,
      alliesDiedThisRound: 0,
      unitsDiedThisRound: 0,
    };
  }

  setup(players, decks) {
    const list = players || [];
    for (const p of list) {
      const deck = (decks?.[p.id] || decks?.[p.name] || []).map((x) => (typeof x === 'string' ? x : x.id || x.cardId)).filter(Boolean);
      const player = {
        id: p.id,
        name: p.name || 'Player',
        team: p.team || 'A',
        connected: p.connected !== false,
        hand: [],
        deck: shuffle([...deck], this.rng),
        discard: [],
        mulliganReady: false,
        mulliganChoices: [],
        stats: {
          cardsPlayed: 0,
          unitsPlayed: 0,
          spellsPlayed: 0,
          spellManaSpent: 0,
          stunnedOrRecalled: 0,
          cardsDrawn: 0,
          damageToEnemyNexus: 0,
          unitsKilled: 0,
          alliesDied: 0,
          survivedDamage: 0,
          levelsGained: 0,
        },
        flags: {},
      };
      this.players.set(player.id, player);
    }
    this.teamPlayers = {
      A: [...this.players.values()].filter((p) => p.team === 'A'),
      B: [...this.players.values()].filter((p) => p.team === 'B'),
    };
    this.attackTokenTeam = this.rng() < 0.5 ? 'A' : 'B';
    this.teams.A.attackToken = this.attackTokenTeam === 'A';
    this.teams.B.attackToken = this.attackTokenTeam === 'B';
    this.log(`Game created: ${this.mode === '2v2' ? '2v2 Team Clash' : '1v1 Duel'}.`, 'system');
    this.log(`${this.teamName(this.attackTokenTeam)} has the first attack token.`, 'system');
    // Initial hands.
    for (const p of this.players.values()) {
      for (let i = 0; i < this.rules.handStart; i++) this.drawCard(p, { silent: true });
    }
    this.log('Mulligan phase — each player may replace any number of cards.', 'phase');
    this.touch();
  }

  // ---------------------------------------------------------------- basics
  teamName(t) { return this.teams[t]?.name || t; }
  otherTeam(t) { return otherTeam(t); }
  unitsOnTeam(t) { return (this.teams[t]?.board || []).filter((u) => !u.dead); }
  allUnits() { return [...this.unitsOnTeam('A'), ...this.unitsOnTeam('B')]; }
  playersOnTeam(t) { return this.teamPlayers[t] || []; }
  unitById(uid) { return this.allUnits().find((u) => u.uid === uid) || null; }
  player(id) { return this.players.get(id) || null; }
  random() { return this.rng(); }
  isAutoChoice(type) { return !targetNeedsChoice(normalizeTarget(type).type); }
  touch() { if (this.onUpdate) this.onUpdate(this); }

  log(text, type = 'info', playerId = null) {
    this.logs.push({ id: ++this.logSeq, round: this.round, text, type, playerId, at: Date.now() });
    if (this.logs.length > 300) this.logs.shift();
  }

  // ---------------------------------------------------------------- units
  makeUnit(card, owner, opts = {}) {
    const rawKeywords = [...(card.rawKeywords || card.keywords || [])];
    const keywordCounts = {};
    for (const k of rawKeywords) {
      const kw = canonicalKeyword(k);
      keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
    }
    return {
      uid: `u${++this.uidSeq}`,
      cardId: card.id,
      card,
      name: card.name,
      owner: owner.id,
      ownerName: owner.name,
      team: owner.team,
      basePower: card.attack || 0,
      baseHealth: Math.max(1, card.health || 1),
      damage: 0,
      buffs: [],
      baseKeywords: new Set(card.keywords || []),
      keywordCounts,
      grantedKeywords: new Set(),
      tempKeywords: new Map(),
      aura: { power: 0, health: 0, keywords: new Set() },
      statuses: {
        stunned: false,
        frostbitten: false,
        barrier: false,
        spellShield: false,
        ephemeral: (card.keywords || []).includes('Ephemeral'),
        deathless: (card.keywords || []).some((k) => k === 'Deathless'),
        silenced: false,
      },
      isLandmark: card.type === 'Landmark',
      isEquipment: card.type === 'Equipment',
      isChampion: card.supertype === 'Champion',
      leveled: false,
      script: card.script || null,
      summonedRound: this.round,
      attacksThisRound: 0,
      strikesThisRound: 0,
      strikesThisGame: 0,
      damageTakenThisRound: 0,
      damageSurvived: 0,
      kills: 0,
      dead: false,
      equipment: [],
      attachedTo: null,
      captured: [],
      summonedBy: opts.source?.uid || null,
    };
  }

  hasKeyword(unit, kw) {
    if (!unit || unit.dead || unit.statuses?.silenced) return false;
    const key = canonicalKeyword(kw);
    if (key === 'Spirit' || key === 'Gloom') return false;
    if (unit.baseKeywords?.has(key)) return true;
    if (unit.grantedKeywords?.has(key)) return true;
    if (unit.aura?.keywords?.has(key)) return true;
    const exp = unit.tempKeywords?.get(key);
    return exp != null && exp >= this.round;
  }

  keywordStacks(unit, kw) {
    if (!unit || unit.statuses?.silenced) return 0;
    let count = unit.keywordCounts?.[kw] || 0;
    if (unit.grantedKeywords?.has(kw)) count = Math.max(count, 1);
    if (unit.aura?.keywords?.has(kw)) count = Math.max(count, 1);
    for (const [k, exp] of unit.tempKeywords || []) if (k === kw && exp >= this.round) count = Math.max(count, 1);
    return count;
  }

  maxHealth(unit) {
    if (!unit) return 0;
    let h = unit.baseHealth;
    for (const b of unit.buffs) h += b.health || 0;
    h += unit.aura?.health || 0;
    h += this.keywordStacks(unit, 'Spirit') - this.keywordStacks(unit, 'Gloom');
    return Math.max(0, h);
  }

  health(unit) {
    if (!unit) return 0;
    return Math.max(0, this.maxHealth(unit) - (unit.damage || 0));
  }

  power(unit) {
    if (!unit) return 0;
    let p = unit.basePower;
    for (const b of unit.buffs) p += b.power || 0;
    p += unit.aura?.power || 0;
    p += this.keywordStacks(unit, 'Spirit') - this.keywordStacks(unit, 'Gloom');
    if (this.hasKeyword(unit, 'Formidable')) p = this.health(unit);
    if (unit.statuses?.frostbitten) p = 0;
    return Math.max(0, p);
  }

  recalcAuras() {
    if (this.recalculating) return;
    this.recalculating = true;
    try {
      for (const u of this.allUnits()) {
        u.aura = { power: 0, health: 0, keywords: new Set() };
      }
      for (const source of this.allUnits()) {
        if (!source.script || source.dead || source.statuses?.silenced) continue;
        const auraTriggers = (source.script.triggers || []).filter((t) => t.on === 'aura');
        if (!auraTriggers.length) continue;
        const owner = this.player(source.owner);
        if (!owner) continue;
        for (const trigger of auraTriggers) {
          const ctx = { source, controller: owner, event: 'aura', combat: this.combat };
          if (!evalCondition(this, trigger.condition, ctx)) continue;
          for (const action of trigger.actions || []) {
            if (!['buff', 'give', 'grantKeyword', 'debuff'].includes(action.type)) continue;
            const spec = normalizeTarget(action.target || 'allOtherAllyUnits');
            const ids = autoTargetIds(this, spec, ctx);
            for (const id of ids) {
              const ent = resolveEntity(this, id);
              if (!ent?.uid) continue;
              const u = this.unitById(ent.uid);
              if (!u) continue;
              if (action.type === 'grantKeyword') {
                u.aura.keywords.add(canonicalKeyword(action.keyword));
              } else {
                const sign = action.type === 'debuff' ? -1 : 1;
                u.aura.power += sign * (action.power ?? action.attack ?? 0);
                u.aura.health += sign * (action.health ?? 0);
              }
            }
          }
        }
      }
    } finally {
      this.recalculating = false;
    }
  }

  healUnit(unit, amount) {
    if (!unit || unit.dead) return 0;
    const healed = Math.min(unit.damage, Math.max(0, amount));
    unit.damage -= healed;
    if (healed > 0) this.log(`${unit.name} heals ${healed}.`, 'heal');
    return healed;
  }

  healNexus(team, amount) {
    const t = this.teams[team];
    if (!t) return 0;
    const healed = Math.min(t.maxNexus - t.nexus, Math.max(0, amount));
    t.nexus += healed;
    if (healed > 0) this.log(`${this.teamName(team)} Nexus heals ${healed}.`, 'heal');
    return healed;
  }

  buffUnit(unit, power, health, duration = 'permanent', source = null) {
    if (!unit || unit.dead) return;
    unit.buffs.push({ power, health, duration, source: source?.uid || null, round: this.round });
    const oldMax = this.maxHealth(unit);
    const newMax = this.maxHealth(unit);
    if (newMax > oldMax) unit.damage = Math.max(0, unit.damage);
    if (newMax < oldMax && unit.damage >= newMax) {
      unit.damage = Math.max(0, newMax - 1);
    }
    const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
    this.log(`${unit.name} gets ${sign(power)}|${sign(health)}${duration === 'round' ? ' this round' : ''}.`, 'buff');
  }

  grantKeyword(unit, keyword, duration = 'permanent') {
    if (!unit || unit.dead) return;
    const kw = canonicalKeyword(keyword);
    if (!kw) return;
    if (duration === 'round') unit.tempKeywords.set(kw, this.round);
    else unit.grantedKeywords.add(kw);
    this.log(`${unit.name} gains ${kw}${duration === 'round' ? ' this round' : ''}.`, 'keyword');
  }

  removeKeyword(unit, keyword) {
    if (!unit) return;
    const kw = canonicalKeyword(keyword);
    unit.grantedKeywords.delete(kw);
    unit.baseKeywords.delete(kw);
    unit.tempKeywords.delete(kw);
    unit.aura.keywords.delete(kw);
    this.log(`${unit.name} loses ${kw}.`, 'keyword');
  }

  grantStatus(unit, status) {
    if (!unit || unit.dead) return;
    unit.statuses[status] = true;
    this.log(`${unit.name} gains ${status}.`, 'status');
  }

  stunUnit(unit) {
    if (!unit || unit.dead) return;
    unit.statuses.stunned = true;
    if (this.combat) {
      this.combat.attackers = this.combat.attackers.filter((u) => u !== unit);
      this.combat.blockers = this.combat.blockers.filter((u) => u !== unit);
      for (const [att, blk] of Object.entries(this.combat.blockMap || {})) {
        if (blk === unit || att === unit.uid) delete this.combat.blockMap[att];
      }
    }
    this.log(`${unit.name} is Stunned.`, 'status');
  }

  frostbiteUnit(unit) {
    if (!unit || unit.dead) return;
    unit.statuses.frostbitten = true;
    this.log(`${unit.name} is Frostbitten.`, 'status');
  }

  silenceUnit(unit) {
    if (!unit || unit.dead) return;
    unit.statuses.silenced = true;
    unit.script = null;
    unit.grantedKeywords.clear();
    unit.tempKeywords.clear();
    unit.aura = { power: 0, health: 0, keywords: new Set() };
    this.log(`${unit.name} is Silenced.`, 'status');
  }

  // ---------------------------------------------------------------- damage / death
  damageUnit(unit, amount, source = null, opts = {}) {
    if (!unit || unit.dead) return 0;
    if (unit.isLandmark && !opts.canHitLandmark) {
      this.log(`${unit.name} is a landmark and can't be damaged.`, 'effect');
      return 0;
    }
    if (opts.spellShield !== false && unit.statuses.spellShield && (opts.spell || opts.skill) && (!source || source.team !== unit.team)) {
      unit.statuses.spellShield = false;
      this.log(`${unit.name}'s Spell Shield negates the effect.`, 'keyword');
      return 0;
    }
    if (unit.statuses.barrier) {
      unit.statuses.barrier = false;
      this.log(`${unit.name}'s Barrier negates the damage.`, 'keyword');
      return 0;
    }
    let dmg = Math.max(0, amount || 0);
    if (this.hasKeyword(unit, 'Tough')) dmg = Math.max(0, dmg - 1);
    if (dmg <= 0) return 0;
    unit.damage += dmg;
    unit.damageTakenThisRound += dmg;
    this.log(`${unit.name} takes ${dmg} damage (${this.health(unit)}/${this.maxHealth(unit)}).`, 'damage');
    if (this.health(unit) <= 0) {
      this.killUnit(unit, { source, reason: 'damage' });
    } else {
      unit.damageSurvived += dmg;
      const owner = this.player(unit.owner);
      if (unit.script && owner) {
        this.runScript(unit.script, 'surviveDamage', unit, owner, { auto: true, eventCtx: { target: source, damage: dmg } });
      }
      this.checkLevelUps();
    }
    return dmg;
  }

  damageNexus(team, amount, source = null, opts = {}) {
    const t = this.teams[team];
    if (!t) return 0;
    const dmg = Math.max(0, amount || 0);
    if (!dmg) return 0;
    t.nexus -= dmg;
    this.log(`${this.teamName(team)} Nexus takes ${dmg} damage (${Math.max(0, t.nexus)} left).`, 'damage');
    const attackerTeam = otherTeam(team);
    this.teams[attackerTeam].plunderedThisRound = true;
    const p = source?.owner ? this.player(source.owner) : null;
    if (p && team !== p.team) p.stats.damageToEnemyNexus += dmg;
    this.checkWin();
    return dmg;
  }

  killUnit(unit, { source = null, reason = 'effect' } = {}) {
    if (!unit || unit.dead) return;
    if (unit.statuses.deathless) {
      unit.statuses.deathless = false;
      unit.damage = Math.max(0, this.maxHealth(unit) - 1);
      unit.statuses.stunned = true;
      this.log(`${unit.name}'s Deathless revives it Stunned with 1 Health.`, 'keyword');
      return;
    }
    if (unit.isEquipment && unit.attachedTo) {
      // Equipment is not a board unit; handled elsewhere.
    }
    unit.dead = true;
    const team = this.teams[unit.team];
    team.board = team.board.filter((u) => u !== unit);
    team.unitsDiedThisRound++;
    team.alliesDiedThisRound++;
    const owner = this.player(unit.owner);
    if (owner) {
      owner.discard.push(unit.cardId);
      owner.stats.alliesDied++;
    }
    if (this.combat) {
      this.combat.attackers = this.combat.attackers.filter((u) => u !== unit);
      this.combat.blockers = this.combat.blockers.filter((u) => u !== unit);
      for (const [att, blk] of Object.entries(this.combat.blockMap || {})) {
        if (blk === unit || att === unit.uid) delete this.combat.blockMap[att];
      }
    }
    // Return attached equipment and captured cards.
    for (const eq of unit.equipment || []) {
      if (owner) this.addCardToHand(owner, eq.cardId, { fromEquipment: true });
    }
    unit.equipment = [];
    for (const cap of unit.captured || []) {
      if (owner) this.addCardToHand(owner, cap, { fromCapture: true });
    }
    this.log(`${unit.name} dies.`, 'death');
    if (source?.uid) {
      const killer = this.unitById(source.uid);
      if (killer) {
        killer.kills = (killer.kills || 0) + 1;
        if (this.hasKeyword(killer, 'Fury')) {
          this.buffUnit(killer, 1, 1, 'permanent', killer);
          this.log(`${killer.name}'s Fury triggers.`, 'keyword');
        }
      }
    }
    // Last Breath / death trigger for this unit.
    if (unit.script) {
      this.runScript(unit.script, 'death', unit, owner, { auto: true, eventCtx: { target: source, killer: source, dead: unit } });
    }
    // Other allies/enemies watching deaths.
    for (const other of this.allUnits()) {
      if (other === unit || !other.script) continue;
      const evt = other.team === unit.team ? 'allyDeath' : 'enemyDeath';
      if ((other.script.triggers || []).some((t) => t.on === evt)) {
        this.runScript(other.script, evt, other, this.player(other.owner), { auto: true, eventCtx: { dead: unit, killer: source } });
      }
    }
    this.recalcAuras();
    this.checkLevelUps();
    this.checkWin();
  }

  obliterateUnit(unit) {
    if (!unit || unit.dead) return;
    unit.dead = true;
    const team = this.teams[unit.team];
    team.board = team.board.filter((u) => u !== unit);
    this.log(`${unit.name} is Obliterated.`, 'death');
    this.recalcAuras();
  }

  recallUnit(unit) {
    if (!unit || unit.dead || unit.isLandmark) return;
    const owner = this.player(unit.owner);
    if (!owner) return;
    if (owner.hand.length >= this.rules.handMax) {
      this.obliterateUnit(unit);
      this.log(`${unit.name} is recalled but hand is full — Obliterated.`, 'death');
      return;
    }
    unit.dead = true;
    this.teams[unit.team].board = this.teams[unit.team].board.filter((u) => u !== unit);
    this.addCardToHand(owner, unit.cardId, { fromRecall: true });
    owner.stats.stunnedOrRecalled++;
    this.log(`${unit.name} is Recalled.`, 'recall');
    this.recalcAuras();
  }

  // ---------------------------------------------------------------- cards & zones
  drawCard(player, { silent = false, fleeting = false } = {}) {
    if (!player) return null;
    if (!player.deck.length) {
      this.loseByDeck(player);
      return null;
    }
    const cardId = player.deck.shift();
    player.stats.cardsDrawn++;
    if (player.hand.length >= this.rules.handMax) {
      this.log(`${player.name} burns ${this.cardDB.get(cardId)?.name || cardId} (hand full).`, 'burn');
      return null;
    }
    const iid = `c${++this.iidSeq}`;
    player.hand.push({ iid, cardId, fleeting });
    if (!silent) this.log(`${player.name} draws a card.`, 'draw', player.id);
    return iid;
  }

  drawCards(player, count, opts = {}) {
    for (let i = 0; i < count; i++) this.drawCard(player, opts);
  }

  addCardToHand(player, cardId, opts = {}) {
    if (!player) return null;
    const card = this.cardDB.get(cardId);
    if (!card) return null;
    if (player.hand.length >= this.rules.handMax) {
      this.log(`${player.name} burns ${card.name} (hand full).`, 'burn');
      return null;
    }
    const iid = `c${++this.iidSeq}`;
    player.hand.push({ iid, cardId, fleeting: !!opts.fleeting });
    this.log(`${player.name} adds ${card.name} to hand${opts.fleeting ? ' (Fleeting)' : ''}.`, 'create', player.id);
    return iid;
  }

  createCard(player, card, { destination = 'hand', fleeting = false } = {}) {
    if (!player || !card) return null;
    if (destination === 'deck') {
      player.deck.push(card.id);
      return card.id;
    }
    return this.addCardToHand(player, card.id, { fleeting });
  }

  discardCards(player, count, { random = true } = {}) {
    if (!player) return;
    for (let i = 0; i < count && player.hand.length; i++) {
      let idx = 0;
      if (random) idx = Math.floor(this.rng() * player.hand.length);
      const [h] = player.hand.splice(idx, 1);
      player.discard.push(h.cardId);
      this.log(`${player.name} discards ${this.cardDB.get(h.cardId)?.name || 'a card'}.`, 'discard', player.id);
    }
  }

  randomCard(filter = {}, player = null) {
    let pool = this.cardDB.enabledCards();
    if (filter.region) pool = pool.filter((c) => (c.regions || []).includes(filter.region));
    if (filter.regions) pool = pool.filter((c) => (c.regions || []).some((r) => filter.regions.includes(r)));
    if (filter.type) pool = pool.filter((c) => c.type === filter.type);
    if (filter.supertype) pool = pool.filter((c) => c.supertype === filter.supertype);
    if (filter.keyword) pool = pool.filter((c) => (c.keywords || []).includes(canonicalKeyword(filter.keyword)));
    if (filter.maxCost != null) pool = pool.filter((c) => c.cost <= filter.maxCost);
    if (filter.minCost != null) pool = pool.filter((c) => c.cost >= filter.minCost);
    if (filter.excludeRegions && player) {
      // Regions the player's deck already has, useful for "from a region other than yours".
      const own = new Set((player.deck || []).flatMap((id) => this.cardDB.get(id)?.regions || []));
      pool = pool.filter((c) => !(c.regions || []).some((r) => own.has(r)));
    }
    if (!pool.length) return null;
    return pool[Math.floor(this.rng() * pool.length)];
  }

  toss(player, count) {
    for (let i = 0; i < count && player.deck.length; i++) {
      const id = player.deck.pop();
      this.log(`${player.name} tosses ${this.cardDB.get(id)?.name || 'a card'}.`, 'toss', player.id);
    }
  }

  shuffleDeck(player) {
    shuffle(player.deck, this.rng);
    this.log(`${player.name} shuffles their deck.`, 'system', player.id);
  }

  predict(player, count = 3) {
    if (!player.deck.length) return;
    const top = player.deck.slice(0, Math.min(count, player.deck.length));
    this.log(`${player.name} Predicts ${top.length} cards.`, 'predict', player.id);
    // Automatic pick for now: the controller draws one of the top cards (prefer highest cost).
    const best = top.map((id) => this.cardDB.get(id)).filter(Boolean).sort((a, b) => (b.cost || 0) - (a.cost || 0))[0];
    if (!best) return;
    const idx = player.deck.indexOf(best.id);
    if (idx >= 0) player.deck.splice(idx, 1);
    this.addCardToHand(player, best.id, { fromPredict: true });
  }

  loseByDeck(player) {
    this.log(`${player.name} has no cards left to draw.`, 'death', player.id);
    this.finish(this.otherTeam(player.team), `${player.name} ran out of cards`);
  }

  // ---------------------------------------------------------------- game flow
  startGame() {
    this.phase = 'playing';
    this.round = 0;
    this.beginRound();
  }

  submitMulligan(playerId, iids = []) {
    const p = this.player(playerId);
    if (!p || this.phase !== 'mulligan') return { ok: false, error: 'Not in mulligan' };
    if (p.mulliganReady) return { ok: false, error: 'Already ready' };
    const wanted = new Set(iids);
    const kept = [];
    const replaced = [];
    for (const h of p.hand) {
      if (wanted.has(h.iid)) replaced.push(h.cardId);
      else kept.push(h);
    }
    p.hand = kept;
    p.deck.push(...replaced);
    shuffle(p.deck, this.rng);
    for (let i = 0; i < replaced.length; i++) this.drawCard(p, { silent: true });
    p.mulliganReady = true;
    p.mulliganChoices = [...wanted];
    this.log(`${p.name} is ready.`, 'ready', p.id);
    if ([...this.players.values()].every((x) => x.mulliganReady)) {
      this.startGame();
    }
    this.touch();
    return { ok: true };
  }

  autoMulligan() {
    for (const p of this.players.values()) {
      if (!p.mulliganReady) this.submitMulligan(p.id, []);
    }
  }

  beginRound() {
    if (this.winner) return;
    this.round++;
    this.phase = 'playing';
    this.passed.clear();
    this.combat = null;
    this.manual = null;
    this.pending = null;
    for (const t of Object.values(this.teams)) {
      t.maxMana = Math.min(this.rules.maxMana, t.maxMana + 1);
      t.mana = t.maxMana;
      t.cardsPlayedThisRound = 0;
      t.spellsPlayedThisRound = 0;
      t.alliesDiedThisRound = 0;
      t.unitsDiedThisRound = 0;
      t.plunderedThisRound = false;
      t.hasAttacked = false;
      t.scoutUsed = false;
      // Cleanup round-limited effects.
      for (const u of t.board) {
        if (u.dead) continue;
        u.statuses.barrier = false;
        u.statuses.frostbitten = false;
        u.statuses.stunned = false;
        u.tempKeywords.clear();
        u.buffs = u.buffs.filter((b) => b.duration !== 'round');
        if (this.hasKeyword(u, 'Regeneration')) this.healUnit(u, 99);
        u.attacksThisRound = 0;
        u.strikesThisRound = 0;
        u.damageTakenThisRound = 0;
      }
    }
    // Attack token alternates each round.
    this.attackTokenTeam = this.round === 1 ? this.attackTokenTeam : this.otherTeam(this.attackTokenTeam);
    this.teams.A.attackToken = this.attackTokenTeam === 'A';
    this.teams.B.attackToken = this.attackTokenTeam === 'B';
    this.activeTeam = this.attackTokenTeam;
    this.priorityTeam = this.attackTokenTeam;
    this.recalcAuras();
    // Round start triggers before the draw.
    for (const u of this.allUnits()) {
      if (u.script) this.runScript(u.script, 'roundStart', u, this.player(u.owner), { auto: true, eventCtx: { round: this.round } });
      if (u.isLandmark && u.card?.keywords?.includes('Countdown')) {
        u.countdown = (u.countdown ?? 1) - 1;
        if (u.countdown <= 0) this.killUnit(u, { reason: 'countdown' });
      }
    }
    // Draw 1 for each player.
    for (const p of this.players.values()) this.drawCard(p);
    this.log(`— Round ${this.round} — ${this.teamName(this.attackTokenTeam)} attacks first.`, 'phase');
    this.checkLevelUps();
    this.checkWin();
    this.touch();
  }

  endRound() {
    if (this.winner) return;
    this.log(`Round ${this.round} ends.`, 'phase');
    for (const u of this.allUnits()) {
      if (u.script) this.runScript(u.script, 'roundEnd', u, this.player(u.owner), { auto: true, eventCtx: { round: this.round } });
    }
    for (const t of Object.values(this.teams)) {
      for (const u of [...t.board]) {
        if (u.dead) continue;
        if (this.hasKeyword(u, 'Ephemeral')) this.killUnit(u, { reason: 'ephemeral' });
        if (this.hasKeyword(u, 'Regeneration')) this.healUnit(u, 99);
      }
    }
    for (const p of this.players.values()) {
      const fleeting = p.hand.filter((h) => h.fleeting);
      if (fleeting.length) {
        p.hand = p.hand.filter((h) => !h.fleeting);
        for (const h of fleeting) this.log(`${p.name}'s Fleeting ${this.cardDB.get(h.cardId)?.name || 'card'} is discarded.`, 'discard', p.id);
      }
    }
    for (const t of Object.values(this.teams)) {
      t.spellMana = Math.min(this.rules.spellManaCap, t.spellMana + t.mana);
    }
    this.manual = null;
    this.beginRound();
  }

  pass(playerId) {
    const p = this.player(playerId);
    if (!p) return { ok: false, error: 'Unknown player' };
    if (this.pending) return { ok: false, error: 'Resolve the pending choice first' };
    if (this.phase === 'gameover') return { ok: false, error: 'Game over' };
    if (this.phase === 'combat' && this.combat?.stage === 'blockers') {
      if (p.team !== this.combat.defendingTeam) return { ok: false, error: 'Only the defender declares blockers' };
      return this.declareBlockers(playerId, {});
    }
    if (this.priorityTeam !== p.team) return { ok: false, error: 'Not your priority' };
    this.passed.add(p.team);
    this.log(`${p.name} passes.`, 'pass', p.id);
    if (this.passed.size >= 2) {
      this.passed.clear();
      if (this.stack.length) {
        this.resolveTopStack();
      } else if (this.phase === 'combat' && this.combat?.stage === 'spells') {
        this.resolveCombat();
      } else if (this.phase === 'playing') {
        this.endRound();
      }
    } else {
      this.priorityTeam = this.otherTeam(p.team);
    }
    this.touch();
    return { ok: true };
  }

  // ---------------------------------------------------------------- playing cards
  cardSpeed(card) {
    const kw = card.keywords || [];
    if (kw.includes('Burst')) return 'Burst';
    if (kw.includes('Focus')) return 'Focus';
    if (kw.includes('Fast')) return 'Fast';
    if (kw.includes('Slow')) return 'Slow';
    return card.spellSpeed || 'Slow';
  }

  canPlay(player, card) {
    if (!player || this.winner) return false;
    if (this.phase === 'combat' && !['Burst', 'Fast'].includes(this.cardSpeed(card))) return false;
    if (!['playing', 'combat'].includes(this.phase)) return false;
    if (this.priorityTeam !== player.team) return false;
    if (this.stack.length && ['Slow', 'Focus'].includes(this.cardSpeed(card))) return false;
    if (this.stack.length && card.type !== 'Spell') return false;
    if (this.phase === 'combat' && card.type !== 'Spell') return false;
    if (this.phase === 'playing' && card.type === 'Spell' && this.stack.length && this.cardSpeed(card) !== 'Fast' && this.cardSpeed(card) !== 'Burst') return false;
    return true;
  }

  playCard(playerId, iid, targetIds = []) {
    const p = this.player(playerId);
    if (!p) return { ok: false, error: 'Unknown player' };
    if (this.pending) return { ok: false, error: 'Resolve the pending choice first' };
    const handIndex = p.hand.findIndex((h) => h.iid === iid);
    if (handIndex < 0) return { ok: false, error: 'Card not in hand' };
    const h = p.hand[handIndex];
    const card = this.cardDB.get(h.cardId);
    if (!card) return { ok: false, error: 'Unknown card' };
    const speed = this.cardSpeed(card);
    if (!this.canPlay(p, card)) return { ok: false, error: 'You cannot play that card now' };
    const team = this.teams[p.team];
    const cost = Math.max(0, card.cost || 0);
    const isSpell = card.type === 'Spell';
    const available = team.mana + (isSpell ? team.spellMana : 0);
    if (available < cost) return { ok: false, error: `Not enough mana (${available}/${cost})` };
    if (isSpell && this.stack.length && !['Fast', 'Burst'].includes(speed)) return { ok: false, error: 'Stack is not empty' };
    // Validate requested targets against the script.
    const specs = card.script ? targetSpecsForScript(card.script) : [];
    const required = specs.filter((s) => ['play', 'summon', 'cast'].includes(s.actionType) || true);
    let chosen = Array.isArray(targetIds) ? [...targetIds] : [];
    if (required.length) {
      let cursor = 0;
      for (const spec of specs) {
        const count = spec.count || 1;
        const slice = chosen.slice(cursor, cursor + count);
        if (slice.length < count) {
          return { ok: false, error: 'Choose a target first', needsTargets: specs };
        }
        const options = targetOptions(this, spec, {
          controller: p,
          source: isSpell ? { id: null, name: card.name, card, owner: p.id, team: p.team, isSpell: true } : null,
        });
        const valid = new Set(options.map((o) => o.id));
        if (slice.some((id) => !valid.has(id))) return { ok: false, error: 'Invalid target', needsTargets: specs };
        cursor += count;
      }
      chosen = chosen.slice(0, required.reduce((n, s) => n + (s.count || 1), 0));
    }
    // Pay the cost. Spells use spell mana first.
    let remaining = cost;
    if (isSpell) {
      const fromSpell = Math.min(team.spellMana, remaining);
      team.spellMana -= fromSpell;
      remaining -= fromSpell;
    }
    team.mana -= remaining;
    p.hand.splice(handIndex, 1);
    p.stats.cardsPlayed++;
    if (isSpell) {
      p.stats.spellsPlayed++;
      p.stats.spellManaSpent += cost;
      team.spellsPlayedThisRound++;
      team.spellsPlayedThisRound = team.spellsPlayedThisRound;
    } else {
      p.stats.unitsPlayed++;
    }
    team.cardsPlayedThisRound++;
    this.log(`${p.name} plays ${card.name} (${cost}).`, 'play', p.id);
    this.lastAction = { playerId, type: 'play', cardId: card.id };
    // Cast triggers from allied units.
    if (isSpell) {
      for (const u of this.unitsOnTeam(p.team)) {
        if (u.script) this.runScript(u.script, 'castSpell', u, this.player(u.owner), { auto: true, eventCtx: { spell: card, caster: p } });
      }
      for (const u of this.unitsOnTeam(this.otherTeam(p.team))) {
        if (u.script) this.runScript(u.script, 'enemySpell', u, this.player(u.owner), { auto: true, eventCtx: { spell: card, caster: p } });
      }
    }
    if (isSpell) {
      const item = {
        sid: `s${++this.stackSeq}`,
        card,
        cardId: card.id,
        casterId: p.id,
        casterName: p.name,
        team: p.team,
        speed,
        targets: chosen,
        script: card.script,
      };
      if (speed === 'Burst' || speed === 'Focus') {
        this.log(`${card.name} resolves at ${speed} speed.`, 'spell', p.id);
        const virtual = { id: null, uid: null, name: card.name, card, owner: p.id, team: p.team, isSpell: true };
        this.runScript(card.script, 'play', virtual, p, {
          presetTargets: chosen,
          eventCtx: { spell: card },
          onDone: () => { this.checkLevelUps(); this.checkWin(); this.touch(); },
        });
        this.checkLevelUps();
        this.checkWin();
        this.touch();
        return { ok: true };
      }
      this.stack.push(item);
      this.passed.clear();
      this.priorityTeam = this.otherTeam(p.team);
      this.log(`${card.name} goes on the stack.`, 'stack', p.id);
      this.touch();
      return { ok: true };
    }
    // Unit, landmark or equipment.
    if (card.type === 'Equipment') {
      const target = chosen.length ? resolveEntity(this, chosen[0]) : null;
      if (!target?.uid) {
        // Refund and reject: equipment needs an ally.
        team.mana += cost;
        p.hand.splice(handIndex, 0, h);
        p.stats.cardsPlayed--;
        p.stats.unitsPlayed--;
        team.cardsPlayedThisRound--;
        return { ok: false, error: 'Equipment needs an allied unit target' };
      }
      const targetUnit = this.unitById(target.uid);
      targetUnit.equipment.push({ cardId: card.id, name: card.name });
      for (const kw of card.keywords || []) targetUnit.grantedKeywords.add(canonicalKeyword(kw));
      this.buffUnit(targetUnit, card.attack || 0, card.health || 0, 'permanent', null);
      this.addMana(team, 0);
      this.passed.clear();
      this.priorityTeam = this.otherTeam(p.team);
      this.log(`${p.name} equips ${card.name} to ${targetUnit.name}.`, 'equip', p.id);
      this.touch();
      return { ok: true };
    }
    // Champion duplicate levels up the existing champion.
    if (card.supertype === 'Champion') {
      const existing = this.unitsOnTeam(p.team).find((u) => u.name === card.name && u.card?.supertype === 'Champion' && !u.leveled);
      if (existing && card.level2Id) {
        this.levelUp(existing);
        this.passed.clear();
        this.priorityTeam = this.otherTeam(p.team);
        this.touch();
        return { ok: true };
      }
    }
    if (this.unitsOnTeam(p.team).length >= this.rules.boardMax && card.type !== 'Equipment') {
      return { ok: false, error: 'Your board is full' };
    }
    const unit = this.summonUnit(card, p, { fromHand: true, source: null, presetTargets: chosen });
    if (!unit) {
      // Refund if the board filled between checks.
      team.mana += cost;
      p.hand.splice(handIndex, 0, h);
      p.stats.cardsPlayed--;
      p.stats.unitsPlayed--;
      team.cardsPlayedThisRound--;
      return { ok: false, error: 'Your board is full' };
    }
    this.passed.clear();
    this.priorityTeam = this.otherTeam(p.team);
    this.touch();
    return { ok: true };
  }

  summonUnit(card, controller, { source = null, token = false, fromHand = false, presetTargets = [] } = {}) {
    if (!card || !controller) return null;
    const team = this.teams[controller.team];
    if (team.board.filter((u) => !u.dead).length >= this.rules.boardMax) {
      this.log(`${controller.name}'s board is full — ${card.name} can't be summoned.`, 'error');
      return null;
    }
    const unit = this.makeUnit(card, controller, { source });
    team.board.push(unit);
    this.log(`${controller.name} summons ${card.name} (${this.power(unit)}|${this.health(unit)}).`, 'summon', controller.id);
    if (this.hasKeyword(unit, 'Attune')) {
      this.addSpellMana(controller.team, 1);
    }
    this.recalcAuras();
    // Other units' summon watchers.
    for (const other of this.allUnits()) {
      if (other === unit || other.dead || !other.script) continue;
      const owner = this.player(other.owner);
      if ((other.script.triggers || []).some((t) => t.on === 'summonOther' || t.on === 'allySummon')) {
        this.runScript(other.script, other.team === controller.team ? 'summonOther' : 'enemySummon', other, owner, { auto: true, eventCtx: { summoned: unit, source: unit } });
      }
    }
    // The summoned card's own triggers.
    if (fromHand) {
      this.runScript(card.script, 'play', unit, controller, { presetTargets, eventCtx: { summoned: unit } });
      this.runScript(card.script, 'summon', unit, controller, { presetTargets: [], eventCtx: { summoned: unit } });
    } else {
      this.runScript(card.script, 'summon', unit, controller, { presetTargets: [], auto: false, eventCtx: { summoned: unit } });
    }
    this.checkLevelUps();
    this.touch();
    return unit;
  }

  runScript(script, event, source, controller, opts = {}) {
    if (!script || !controller) {
      if (opts.onDone) opts.onDone();
      return;
    }
    const entries = (script.triggers || []).filter((t) => t.on === event);
    let firstResolution = null;
    for (const trigger of entries) {
      if (!evalCondition(this, trigger.condition, {
        source, controller, event, ...opts.eventCtx, combat: opts.eventCtx?.combat || this.combat,
      })) continue;
      const resolution = {
        script,
        trigger,
        controller,
        actions: trigger.actions || [],
        index: 0,
        chosen: new Map(),
        ctx: {
          event, source, controller, ...opts.eventCtx,
          target: opts.eventCtx?.target || null,
          combat: opts.eventCtx?.combat || this.combat,
        },
        auto: !!opts.auto,
        presetTargets: [...(opts.presetTargets || [])],
        onDone: null,
      };
      this.resolutionStack.push(resolution);
      if (!firstResolution) firstResolution = resolution;
    }
    if (!firstResolution) {
      if (opts.onDone) opts.onDone();
      return;
    }
    // The first resolution sits at the bottom of the stack and therefore finishes last.
    firstResolution.onDone = opts.onDone || null;
    this.effects.pump();
  }

  // ---------------------------------------------------------------- stack
  resolveTopStack() {
    const item = this.stack.pop();
    if (!item) return;
    const caster = this.player(item.casterId);
    this.log(`${item.card.name} resolves.`, 'spell', caster?.id);
    // Spell Shield check against chosen targets.
    let negated = false;
    for (const id of item.targets) {
      const ent = resolveEntity(this, id);
      if (ent?.uid) {
        const u = this.unitById(ent.uid);
        if (u && u.team !== item.team && u.statuses.spellShield) {
          u.statuses.spellShield = false;
          negated = true;
          this.log(`${u.name}'s Spell Shield negates ${item.card.name}.`, 'keyword');
        }
      }
    }
    if (negated) {
      this.afterStackResolution(item);
      return;
    }
    const virtual = { id: null, uid: null, name: item.card.name, card: item.card, owner: item.casterId, team: item.team, isSpell: true };
    this.runScript(item.script, 'play', virtual, caster, {
      presetTargets: item.targets,
      eventCtx: { spell: item.card },
      onDone: () => {
        this.checkLevelUps();
        this.checkWin();
        this.afterStackResolution(item);
      },
    });
  }

  afterStackResolution(item) {
    if (this.winner) return;
    this.passed.clear();
    this.priorityTeam = this.otherTeam(item.team);
    if (this.phase === 'combat' && this.combat?.stage === 'spells' && !this.stack.length) {
      // Combat continues; the defending player gets priority first.
      this.priorityTeam = this.combat.defendingTeam;
    }
    this.touch();
  }

  counterTopStack() {
    const item = this.stack.pop();
    if (item) this.log(`${item.card.name} is countered.`, 'spell');
  }

  // ---------------------------------------------------------------- combat
  canAttack(player, unit) {
    if (!player || !unit || unit.dead) return false;
    if (this.phase !== 'playing' || this.stack.length) return false;
    if (this.priorityTeam !== player.team) return false;
    if (!this.teams[player.team].attackToken || this.teams[player.team].hasAttacked) return false;
    if (unit.team !== player.team) return false;
    if (unit.isLandmark || unit.statuses.stunned) return false;
    if (this.hasKeyword(unit, 'Immobile') || this.hasKeyword(unit, 'CantAttack')) return false;
    return true;
  }

  attack(playerId, attackerUids = [], challengers = {}) {
    const p = this.player(playerId);
    if (!p) return { ok: false, error: 'Unknown player' };
    if (this.pending) return { ok: false, error: 'Resolve the pending choice first' };
    if (this.phase !== 'playing' || this.stack.length) return { ok: false, error: 'You cannot attack now' };
    if (this.priorityTeam !== p.team) return { ok: false, error: 'Not your priority' };
    const team = this.teams[p.team];
    if (!team.attackToken) return { ok: false, error: 'No attack token' };
    if (team.hasAttacked) return { ok: false, error: 'Already attacked this round' };
    const attackers = [];
    for (const uid of attackerUids) {
      const u = this.unitsOnTeam(p.team).find((x) => x.uid === uid);
      if (!u) return { ok: false, error: 'Invalid attacker' };
      if (!this.canAttack(p, u)) return { ok: false, error: `${u.name} can't attack` };
      attackers.push(u);
    }
    if (!attackers.length) return { ok: false, error: 'Choose at least one attacker' };
    team.hasAttacked = true;
    for (const u of attackers) u.attacksThisRound++;
    this.combat = {
      attackers,
      defenders: this.unitsOnTeam(this.otherTeam(p.team)),
      defendingTeam: this.otherTeam(p.team),
      attackingTeam: p.team,
      stage: 'blockers',
      blockMap: {},
      blockers: [],
      challengers: challengers || {},
    };
    this.phase = 'combat';
    this.passed.clear();
    this.priorityTeam = this.combat.defendingTeam;
    this.log(`${p.name} attacks with ${attackers.map((u) => u.name).join(', ')}.`, 'attack', p.id);
    // Attack triggers.
    for (const u of attackers) {
      if (u.script) this.runScript(u.script, 'attack', u, this.player(u.owner), { auto: true, eventCtx: { attacker: u, combat: this.combat } });
    }
    for (const u of this.unitsOnTeam(p.team)) {
      if (!attackers.includes(u) && u.script) this.runScript(u.script, 'allyAttack', u, this.player(u.owner), { auto: true, eventCtx: { attackers, combat: this.combat } });
    }
    this.recalcAuras();
    this.checkLevelUps();
    this.checkWin();
    if (this.winner) return { ok: true };
    // If the defender has no legal blockers, skip the blocker step.
    const possible = this.unitsOnTeam(this.combat.defendingTeam).some((u) => attackers.some((a) => this.canBlockUnit(u, a)));
    if (!possible) {
      this.log(`No blockers available for ${this.teamName(this.combat.defendingTeam)}.`, 'combat');
      this.combat.stage = 'spells';
      this.priorityTeam = p.team;
      this.passed.clear();
    }
    this.touch();
    return { ok: true };
  }

  canBlockUnit(blocker, attacker) {
    if (!blocker || blocker.dead || !attacker) return false;
    if (blocker.statuses.stunned || blocker.isLandmark) return false;
    if (this.hasKeyword(blocker, 'Immobile') || this.hasKeyword(blocker, "Can't Block") || this.hasKeyword(blocker, 'CantBlock')) return false;
    if (this.hasKeyword(attacker, 'Elusive') && !this.hasKeyword(blocker, 'Elusive') && !this.hasKeyword(blocker, 'Sharpsight')) return false;
    if (this.hasKeyword(attacker, 'Fearsome') && this.power(blocker) < 3) return false;
    if (this.hasKeyword(attacker, 'Brash') && this.health(blocker) < 3) return false;
    return true;
  }

  declareBlockers(playerId, blocks = {}) {
    const p = this.player(playerId);
    if (!p) return { ok: false, error: 'Unknown player' };
    if (this.pending) return { ok: false, error: 'Resolve the pending choice first' };
    if (this.phase !== 'combat' || this.combat?.stage !== 'blockers') return { ok: false, error: 'Not in blocker step' };
    if (p.team !== this.combat.defendingTeam) return { ok: false, error: 'Only the defender declares blockers' };
    const used = new Set();
    const map = {};
    // Challenger forces specific blocks.
    for (const attacker of this.combat.attackers) {
      const forcedId = this.combat.challengers?.[attacker.uid];
      if (forcedId) {
        const forced = this.unitById(forcedId);
        if (forced && !used.has(forced.uid) && this.canBlockUnit(forced, attacker)) {
          map[attacker.uid] = forced.uid;
          used.add(forced.uid);
        }
      }
    }
    for (const [attackerUid, blockerUid] of Object.entries(blocks || {})) {
      const attacker = this.combat.attackers.find((u) => u.uid === attackerUid);
      const blocker = this.unitById(blockerUid);
      if (!attacker || !blocker) return { ok: false, error: 'Invalid block' };
      if (map[attackerUid]) continue; // challenger wins
      if (blocker.team !== p.team) return { ok: false, error: 'Blocker must be yours' };
      if (used.has(blocker.uid)) return { ok: false, error: 'A unit can only block once' };
      if (!this.canBlockUnit(blocker, attacker)) return { ok: false, error: `${blocker.name} can't block ${attacker.name}` };
      map[attackerUid] = blocker.uid;
      used.add(blocker.uid);
    }
    this.combat.blockMap = map;
    this.combat.blockers = Object.values(map).map((uid) => this.unitById(uid)).filter(Boolean);
    this.combat.stage = 'spells';
    this.passed.clear();
    this.priorityTeam = this.combat.attackingTeam;
    this.log(map && Object.keys(map).length ? `${p.name} declares blockers.` : `${p.name} declares no blockers.`, 'combat', p.id);
    this.touch();
    return { ok: true };
  }

  resolveCombat() {
    const combat = this.combat;
    if (!combat) return;
    this.log('Combat resolves.', 'combat');
    for (const attacker of [...combat.attackers]) {
      if (attacker.dead) continue;
      const blockerId = combat.blockMap?.[attacker.uid];
      const blocker = blockerId ? this.unitById(blockerId) : null;
      if (!blocker || blocker.dead) {
        this.strike(attacker, { nexus: combat.defendingTeam, team: combat.defendingTeam }, { combat: true });
        if (this.hasKeyword(attacker, 'Double Attack')) {
          this.strike(attacker, { nexus: combat.defendingTeam, team: combat.defendingTeam }, { combat: true });
        }
        continue;
      }
      this.combatExchange(attacker, blocker);
    }
    const attackingTeam = combat.attackingTeam;
    const hadScout = combat.attackers.some((u) => !u.dead && this.hasKeyword(u, 'Scout'));
    this.combat = null;
    this.phase = 'playing';
    this.checkWin();
    if (this.winner) { this.touch(); return; }
    if (hadScout && !this.teams[attackingTeam].scoutUsed) {
      this.teams[attackingTeam].scoutUsed = true;
      this.rally(attackingTeam);
      this.log('Scout readies the attack!', 'keyword');
    } else {
      this.endRound();
    }
    this.touch();
  }

  combatExchange(attacker, blocker) {
    const quick = this.hasKeyword(attacker, 'Quick Attack');
    const double = this.hasKeyword(attacker, 'Double Attack');
    if (quick || double) {
      this.strike(attacker, blocker, { combat: true, simultaneous: false });
      if (!blocker.dead) this.strike(blocker, attacker, { combat: true, simultaneous: false });
      if (double && !attacker.dead) {
        if (!blocker.dead) this.strike(attacker, blocker, { combat: true });
        else this.strike(attacker, { nexus: this.combat.defendingTeam, team: this.combat.defendingTeam }, { combat: true });
      }
    } else {
      // Simultaneous: snapshot the power so a dying blocker still deals damage.
      const attackerPower = this.power(attacker);
      const blockerPower = this.power(blocker);
      this.strike(attacker, blocker, { combat: true, simultaneous: true, fixedPower: attackerPower });
      this.strike(blocker, attacker, { combat: true, simultaneous: true, fixedPower: blockerPower });
    }
  }

  strike(source, target, { combat = false, simultaneous = false, fixedPower = null, effect = false } = {}) {
    if (!source || (source.dead && !simultaneous)) return;
    const amount = fixedPower != null ? fixedPower : this.power(source);
    let dealt = 0;
    let targetDied = false;
    if (target?.nexus) {
      dealt = this.damageNexus(target.nexus, amount, source, { combat });
      const owner = this.player(source.owner);
      if (source.script && owner) this.runScript(source.script, 'nexusStrike', source, owner, { auto: true, eventCtx: { target, combat } });
    } else if (target?.uid) {
      const t = this.unitById(target.uid);
      if (!t || t.dead) return;
      const before = this.health(t);
      const actual = this.damageUnit(t, amount, source, { combat, canHitLandmark: false });
      dealt += actual;
      targetDied = t.dead;
      // Overwhelm: excess combat damage goes to the enemy Nexus.
      if (combat && this.hasKeyword(source, 'Overwhelm') && amount > before) {
        const excess = amount - before;
        this.damageNexus(t.team, excess, source, { combat });
        dealt += excess;
      }
      const owner = this.player(source.owner);
      if (source.script && owner) this.runScript(source.script, 'strike', source, owner, { auto: true, eventCtx: { target: t, combat, targetDied } });
    }
    // Impact stacks.
    if (combat && this.hasKeyword(source, 'Impact')) {
      const stacks = this.keywordStacks(source, 'Impact');
      if (stacks > 0) this.damageNexus(this.otherTeam(source.team), stacks, source, { combat });
    }
    if (source && this.hasKeyword(source, 'Lifesteal') && dealt > 0) this.healNexus(source.team, dealt);
    if (combat) {
      source.strikesThisRound++;
      if (this.hasKeyword(source, 'Ephemeral')) this.killUnit(source, { reason: 'ephemeral' });
    }
    source.strikesThisGame++;
    this.checkLevelUps();
    this.checkWin();
  }

  fireEvent(event, ctx = {}) {
    if (this.winner) return;
    const units = [...this.allUnits()];
    for (const u of units) {
      if (u.dead || !u.script) continue;
      if (!(u.script.triggers || []).some((t) => t.on === event)) continue;
      const owner = this.player(u.owner);
      if (!owner) continue;
      this.runScript(u.script, event, u, owner, { auto: true, eventCtx: ctx });
    }
  }

  rally(team) {
    const t = this.teams[team];
    if (!t) return;
    t.attackToken = true;
    t.hasAttacked = false;
    this.attackTokenTeam = team;
    if (this.phase === 'combat') this.phase = 'playing';
    this.priorityTeam = team;
    this.passed.clear();
    this.log(`${this.teamName(team)} rallies!`, 'combat');
    this.touch();
  }

  addMana(team, amount) {
    const t = this.teams[team];
    if (!t) return;
    t.mana = Math.max(0, t.mana + amount);
    if (amount > 0) this.log(`${this.teamName(team)} gains ${amount} mana.`, 'mana');
  }

  addSpellMana(team, amount) {
    const t = this.teams[team];
    if (!t) return;
    const before = t.spellMana;
    t.spellMana = clamp(t.spellMana + amount, 0, this.rules.spellManaCap);
    if (t.spellMana !== before) this.log(`${this.teamName(team)} gains ${t.spellMana - before} spell mana.`, 'mana');
  }

  addManaGem(team) {
    const t = this.teams[team];
    if (!t) return;
    t.maxMana = Math.min(this.rules.maxMana, t.maxMana + 1);
    t.mana = t.maxMana;
    this.log(`${this.teamName(team)} gains a mana gem (${t.maxMana}).`, 'mana');
  }

  // ---------------------------------------------------------------- champions
  checkLevelUps() {
    if (this.levelChecking) return;
    this.levelChecking = true;
    try {
      for (const u of this.allUnits()) {
        if (!u.isChampion || u.leveled || !u.card?.level2Id || u.dead) continue;
        const cond = u.script?.levelUp?.condition;
        if (!cond) continue;
        const owner = this.player(u.owner);
        if (!owner) continue;
        if (evalCondition(this, cond, { source: u, controller: owner, event: 'levelUp', combat: this.combat })) {
          this.levelUp(u);
        }
      }
    } finally {
      this.levelChecking = false;
    }
  }

  levelUp(unit) {
    if (!unit || unit.dead || unit.leveled) return;
    const next = this.cardDB.get(unit.card?.level2Id);
    if (!next) {
      this.log(`${unit.name} cannot level up (missing level 2 card).`, 'error');
      return;
    }
    const damage = unit.damage;
    unit.card = next;
    unit.cardId = next.id;
    unit.name = next.name;
    unit.basePower = next.attack;
    unit.baseHealth = Math.max(1, next.health);
    unit.baseKeywords = new Set(next.keywords || []);
    unit.grantedKeywords = new Set(next.keywords || []);
    unit.keywordCounts = {};
    for (const k of next.rawKeywords || next.keywords || []) {
      const kw = canonicalKeyword(k);
      unit.keywordCounts[kw] = (unit.keywordCounts[kw] || 0) + 1;
    }
    unit.statuses.ephemeral = (next.keywords || []).includes('Ephemeral');
    unit.script = next.script || null;
    unit.leveled = true;
    unit.damage = Math.min(damage, Math.max(0, this.maxHealth(unit) - 1));
    this.log(`⬆ ${unit.name} levels up!`, 'levelup', unit.owner);
    const owner = this.player(unit.owner);
    if (owner) owner.stats.levelsGained++;
    if (unit.script) this.runScript(unit.script, 'levelUp', unit, owner, { auto: true, eventCtx: { unit } });
    this.recalcAuras();
    this.checkWin();
    this.touch();
  }

  transformUnit(unit, cardId) {
    if (!unit) return;
    const next = this.cardDB.get(cardId);
    if (!next) return;
    unit.card = next;
    unit.cardId = next.id;
    unit.name = next.name;
    unit.basePower = next.attack;
    unit.baseHealth = Math.max(1, next.health);
    unit.baseKeywords = new Set(next.keywords || []);
    unit.grantedKeywords = new Set(next.keywords || []);
    unit.script = next.script || null;
    unit.damage = Math.min(unit.damage, Math.max(0, this.maxHealth(unit) - 1));
    this.recalcAuras();
    this.log(`${unit.name} transforms.`, 'transform');
  }

  copyUnit(unit, controller) {
    if (!unit) return null;
    return this.summonUnit(unit.card, controller, { token: true });
  }

  // ---------------------------------------------------------------- choices
  resolveChoice(playerId, ids = []) {
    if (!this.pending) return { ok: false, error: 'No pending choice' };
    if (this.pending.playerId !== playerId) return { ok: false, error: 'Not your choice' };
    const res = this.pending.resolution;
    const count = this.pending.max || 1;
    const picked = [...new Set(Array.isArray(ids) ? ids : [ids])].slice(0, count);
    if (picked.length < (this.pending.min || 1)) return { ok: false, error: 'Choose more targets' };
    res.chosen.set(this.pending.path, picked);
    const label = picked.map((id) => this.pending.options.find((o) => o.id === id)?.label || id).join(', ');
    this.log(`${this.pending.playerName} chooses ${label}.`, 'choice');
    this.pending = null;
    this.effects.pump();
    this.checkLevelUps();
    this.checkWin();
    this.touch();
    return { ok: true };
  }

  // ---------------------------------------------------------------- win
  checkWin() {
    if (this.winner) return;
    if (this.teams.A.nexus <= 0 && this.teams.B.nexus <= 0) return this.finish(null, 'Both Nexuses fell');
    if (this.teams.A.nexus <= 0) return this.finish('B', 'Team A Nexus destroyed');
    if (this.teams.B.nexus <= 0) return this.finish('A', 'Team B Nexus destroyed');
  }

  finish(team, reason) {
    if (this.winner) return;
    this.winner = team || 'draw';
    this.winReason = reason;
    this.phase = 'gameover';
    this.pending = null;
    this.combat = null;
    this.stack = [];
    this.log(team ? `${this.teamName(team)} wins! ${reason}` : `Draw. ${reason}`, 'gameover');
    this.touch();
  }

  surrender(playerId) {
    const p = this.player(playerId);
    if (!p || this.winner) return { ok: false, error: 'Cannot surrender' };
    this.finish(this.otherTeam(p.team), `${p.name} surrendered`);
    return { ok: true };
  }

  // Tabletop tools for cards whose text has not been scripted yet. Self-hosted games
  // are played with friends; every manual action is logged so the table can verify it.
  manualAction(playerId, op = {}) {
    const p = this.player(playerId);
    if (!p) return { ok: false, error: 'Unknown player' };
    if (this.phase === 'mulligan' || this.phase === 'gameover') return { ok: false, error: 'The game is not in progress' };
    const amount = Math.max(0, Math.min(99, Number(op.amount ?? 1) || 1));
    const ent = op.targetId ? resolveEntity(this, op.targetId) : null;
    const unit = ent?.uid ? this.unitById(ent.uid) : null;
    const nexusTeam = ent?.nexus && ['A', 'B'].includes(ent.nexus) ? ent.nexus : (['A', 'B'].includes(op.team) ? op.team : null);
    const needsUnit = () => {
      if (!unit || unit.dead) { this.log('Manual action needs a living unit target.', 'error'); return false; }
      return true;
    };
    switch (op.type) {
      case 'damage':
        if (unit) this.damageUnit(unit, amount, null, { canHitLandmark: !!op.canHitLandmark });
        else if (nexusTeam) this.damageNexus(nexusTeam, amount, null, {});
        else return { ok: false, error: 'Choose a target' };
        break;
      case 'heal':
        if (unit) this.healUnit(unit, amount);
        else if (nexusTeam) this.healNexus(nexusTeam, amount);
        else return { ok: false, error: 'Choose a target' };
        break;
      case 'buff':
        if (!needsUnit()) return { ok: false, error: 'Choose an allied unit' };
        this.buffUnit(unit, Number(op.power || 0), Number(op.health || 0), op.duration === 'round' ? 'round' : 'permanent', null);
        break;
      case 'keyword':
      case 'grantKeyword':
        if (!needsUnit()) return { ok: false, error: 'Choose a unit' };
        this.grantKeyword(unit, op.keyword || op.value || '', op.duration === 'round' ? 'round' : 'permanent');
        break;
      case 'removeKeyword':
        if (!needsUnit()) return { ok: false, error: 'Choose a unit' };
        this.removeKeyword(unit, op.keyword || op.value || '');
        break;
      case 'barrier': if (!needsUnit()) return { ok: false, error: 'Choose a unit' }; this.grantStatus(unit, 'barrier'); break;
      case 'spellShield': if (!needsUnit()) return { ok: false, error: 'Choose a unit' }; this.grantStatus(unit, 'spellShield'); break;
      case 'stun': if (!needsUnit()) return { ok: false, error: 'Choose a unit' }; this.stunUnit(unit); break;
      case 'frostbite': if (!needsUnit()) return { ok: false, error: 'Choose a unit' }; this.frostbiteUnit(unit); break;
      case 'recall': if (!needsUnit()) return { ok: false, error: 'Choose a unit' }; this.recallUnit(unit); p.stats.stunnedOrRecalled++; break;
      case 'silence': if (!needsUnit()) return { ok: false, error: 'Choose a unit' }; this.silenceUnit(unit); break;
      case 'kill': if (!needsUnit()) return { ok: false, error: 'Choose a unit' }; this.killUnit(unit, { reason: 'manual' }); break;
      case 'obliterate': if (!needsUnit()) return { ok: false, error: 'Choose a unit' }; this.obliterateUnit(unit); break;
      case 'draw': this.drawCards(p, amount); break;
      case 'discard': this.discardCards(p, amount, { random: !!op.random }); break;
      case 'summon': {
        const card = (op.cardId && this.cardDB.get(op.cardId)) || (op.name && (this.cardDB.findToken(op.name) || this.cardDB.getByName(op.name)));
        if (!card) return { ok: false, error: 'Unknown card to summon' };
        const u = this.summonUnit(card, p, { token: true });
        if (!u) return { ok: false, error: 'Board is full' };
        break;
      }
      case 'create': {
        const card = (op.cardId && this.cardDB.get(op.cardId)) || (op.name && (this.cardDB.findToken(op.name) || this.cardDB.getByName(op.name)));
        if (!card) return { ok: false, error: 'Unknown card to create' };
        this.createCard(p, card, { destination: op.destination || 'hand', fleeting: !!op.fleeting });
        break;
      }
      case 'toss': this.toss(p, amount); break;
      case 'predict': this.predict(p, amount || 3); break;
      case 'shuffle': this.shuffleDeck(p); break;
      case 'rally': this.rally(op.team && ['A', 'B'].includes(op.team) ? op.team : p.team); break;
      case 'mana': this.addMana(p.team, amount); break;
      case 'spellMana': this.addSpellMana(p.team, amount); break;
      case 'nexusDamage':
        this.damageNexus(nexusTeam || this.otherTeam(p.team), amount, null, {});
        break;
      case 'nexusHeal':
        this.healNexus(nexusTeam || p.team, amount);
        break;
      case 'levelUp': if (!needsUnit()) return { ok: false, error: 'Choose a champion' }; this.levelUp(unit); break;
      case 'transform': {
        if (!needsUnit()) return { ok: false, error: 'Choose a unit' };
        const card = op.cardId && this.cardDB.get(op.cardId);
        if (!card) return { ok: false, error: 'Unknown transform card' };
        this.transformUnit(unit, card.id);
        break;
      }
      case 'counter': this.counterTopStack(); break;
      case 'log': this.log(`[Manual] ${op.text || ''}`, 'manual'); return { ok: true };
      default: return { ok: false, error: `Unknown manual action: ${op.type}` };
    }
    this.log(`[Manual] ${op.type}${unit ? ` on ${unit.name}` : nexusTeam ? ` on ${this.teamName(nexusTeam)} Nexus` : ''}${op.amount ? ` (${op.amount})` : ''}.`, 'manual', p.id);
    this.checkLevelUps();
    this.checkWin();
    this.touch();
    return { ok: true };
  }

  // ---------------------------------------------------------------- view
  viewFor(playerId, { revealAll = false } = {}) {
    const viewer = this.player(playerId);
    const visibleHand = (p) => {
      if (revealAll || p.id === playerId) {
        return p.hand.map((h) => {
          const c = this.cardDB.get(h.cardId);
          return { iid: h.iid, ...cardView(c), fleeting: h.fleeting };
        });
      }
      return p.hand.map((h) => ({ iid: null, hidden: true, fleeting: h.fleeting }));
    };
    const unitView = (u) => ({
      uid: u.uid,
      cardId: u.cardId,
      name: u.name,
      cost: u.card?.cost || 0,
      power: this.power(u),
      health: this.health(u),
      maxHealth: this.maxHealth(u),
      basePower: u.basePower,
      baseHealth: u.baseHealth,
      owner: u.owner,
      ownerName: u.ownerName,
      team: u.team,
      isChampion: u.isChampion,
      leveled: u.leveled,
      isLandmark: u.isLandmark,
      keywords: [...new Set([
        ...(u.baseKeywords || []),
        ...(u.grantedKeywords || []),
        ...(u.aura?.keywords || []),
        ...[...u.tempKeywords.entries()].filter(([, exp]) => exp >= this.round).map(([k]) => k),
      ])],
      statuses: { ...u.statuses },
      art: u.card?.art,
      fullArt: u.card?.fullArt,
      text: u.card?.text,
      levelup: u.card?.levelup,
      subtypes: u.card?.subtypes,
      regions: u.card?.regions,
      damage: u.damage,
      canAttack: this.canAttack(viewer, u),
      canBlock: this.phase === 'combat' && this.combat?.stage === 'blockers' && u.team === this.combat.defendingTeam,
    });
    const teamView = (t) => ({
      id: t.id,
      name: t.name,
      nexus: Math.max(0, t.nexus),
      maxNexus: t.maxNexus,
      mana: t.mana,
      spellMana: t.spellMana,
      maxMana: t.maxMana,
      attackToken: t.attackToken,
      hasAttacked: t.hasAttacked,
      board: t.board.filter((u) => !u.dead).map(unitView),
      players: this.teamPlayers[t.id].map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        handCount: p.hand.length,
        deckCount: p.deck.length,
        connected: p.connected,
        mulliganReady: p.mulliganReady,
        isYou: p.id === playerId,
        isPriority: this.priorityTeam === p.team,
        stats: p.id === playerId ? p.stats : undefined,
        hand: visibleHand(p),
      })),
    });
    const myTeam = viewer?.team || null;
    const enemyTeam = myTeam ? this.otherTeam(myTeam) : null;
    const canAct = viewer && this.priorityTeam === viewer.team && !this.pending && this.phase !== 'gameover' && this.phase !== 'mulligan';
    const legal = {
      canAct: !!canAct,
      canPass: !!canAct,
      canAttack: !!(viewer && this.phase === 'playing' && this.priorityTeam === viewer.team && this.teams[viewer.team].attackToken && !this.teams[viewer.team].hasAttacked && !this.stack.length),
      canBlock: !!(viewer && this.phase === 'combat' && this.combat?.stage === 'blockers' && viewer.team === this.combat.defendingTeam),
      playable: viewer && canAct ? viewer.hand.filter((h) => {
        const c = this.cardDB.get(h.cardId);
        return c && this.canPlay(viewer, c) && this.teams[viewer.team].mana + (c.type === 'Spell' ? this.teams[viewer.team].spellMana : 0) >= c.cost;
      }).map((h) => h.iid) : [],
    };
    return {
      id: this.id,
      mode: this.mode,
      round: this.round,
      phase: this.phase,
      winner: this.winner,
      winReason: this.winReason,
      priorityTeam: this.priorityTeam,
      activeTeam: this.activeTeam,
      attackTokenTeam: this.attackTokenTeam,
      stack: this.stack.map((s) => ({
        sid: s.sid,
        cardId: s.cardId,
        name: s.card.name,
        cost: s.card.cost,
        speed: s.speed,
        art: s.card.art,
        fullArt: s.card.fullArt,
        text: s.card.text,
        casterId: s.casterId,
        casterName: s.casterName,
        team: s.team,
        targets: s.targets,
      })),
      combat: this.combat ? {
        attackers: this.combat.attackers.map((u) => u.uid),
        blockMap: { ...(this.combat.blockMap || {}) },
        stage: this.combat.stage,
        attackingTeam: this.combat.attackingTeam,
        defendingTeam: this.combat.defendingTeam,
      } : null,
      pending: this.pending ? (this.pending.playerId === playerId || revealAll ? {
        playerId: this.pending.playerId,
        playerName: this.pending.playerName,
        prompt: this.pending.prompt,
        options: this.pending.options,
        min: this.pending.min,
        max: this.pending.max,
      } : { waiting: true, playerName: this.pending.playerName, prompt: this.pending.prompt }) : null,
      teams: { A: teamView(this.teams.A), B: teamView(this.teams.B) },
      you: viewer ? {
        id: viewer.id,
        name: viewer.name,
        team: viewer.team,
        hand: visibleHand(viewer),
        deckCount: viewer.deck.length,
        discard: viewer.discard.map((id) => cardView(this.cardDB.get(id))),
        stats: viewer.stats,
      } : null,
      legal,
      log: this.logs.slice(-120),
      manual: this.manual,
      settings: { rules: this.rules },
    };
  }
}
