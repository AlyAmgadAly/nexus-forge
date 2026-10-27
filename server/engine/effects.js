// Data-driven effect interpreter (DSL) used by Riot cards, custom cards and the admin forge.
// A script looks like:
//   { triggers: [{ on: "play", condition: {...}, actions: [{ type: "damage", amount: 2, target: "enemyUnit" }] }] }
// Targets are resolved lazily. Top-level plays can prompt the controller; triggers auto-resolve.
import { canonicalKeyword, clamp } from './constants.js';
import { CHOICE_TARGETS, EVENTS } from '../../shared/script-vocabulary.js';

export function targetNeedsChoice(type) {
  return CHOICE_TARGETS.has(type);
}

export function normalizeTarget(spec) {
  if (!spec) return { type: 'none', count: 1, filter: {} };
  if (typeof spec === 'string') return { type: spec, count: 1, filter: {} };
  return { type: spec.type || 'none', count: spec.count ?? 1, filter: spec.filter || {}, prompt: spec.prompt };
}

function matchesFilter(game, unit, filter = {}) {
  if (!unit) return false;
  if (filter.type === 'champion' && unit.card?.supertype !== 'Champion') return false;
  if (filter.type === 'follower' && unit.card?.supertype === 'Champion') return false;
  if (filter.type === 'landmark' && !unit.isLandmark) return false;
  if (filter.type === 'unit' && unit.isLandmark) return false;
  if (filter.type === 'equipment' && !unit.isEquipment) return false;
  if (filter.keyword && !game.hasKeyword(unit, canonicalKeyword(filter.keyword))) return false;
  if (filter.notKeyword && game.hasKeyword(unit, canonicalKeyword(filter.notKeyword))) return false;
  if (filter.minPower != null && game.power(unit) < filter.minPower) return false;
  if (filter.maxPower != null && game.power(unit) > filter.maxPower) return false;
  if (filter.minHealth != null && game.health(unit) < filter.minHealth) return false;
  if (filter.maxHealth != null && game.health(unit) > filter.maxHealth) return false;
  if (filter.maxCost != null && (unit.card?.cost ?? 0) > filter.maxCost) return false;
  if (filter.minCost != null && (unit.card?.cost ?? 0) < filter.minCost) return false;
  if (filter.damaged === true && unit.damage <= 0) return false;
  if (filter.damaged === false && unit.damage > 0) return false;
  if (filter.region && !(unit.card?.regions || []).includes(filter.region)) return false;
  if (filter.subtype && !(unit.card?.subtypes || []).includes(filter.subtype)) return false;
  if (filter.supertype && unit.card?.supertype !== filter.supertype) return false;
  if (filter.excludeSource && unit === filter.excludeSource) return false;
  if (filter.excludeUid && unit.uid === filter.excludeUid) return false;
  if (filter.champion === true && unit.card?.supertype !== 'Champion') return false;
  if (filter.champion === false && unit.card?.supertype === 'Champion') return false;
  if (filter.equipped === true && !(unit.equipment || []).length) return false;
  if (filter.equipped === false && (unit.equipment || []).length) return false;
  if (Array.isArray(filter.types) && filter.types.length) {
    const matches = filter.types.some((type) => matchesFilter(game, unit, { ...filter, type, types: null }));
    if (!matches) return false;
  }
  return true;
}

export function targetOptions(game, rawSpec, ctx = {}) {
  const spec = normalizeTarget(rawSpec);
  const controller = ctx.controller;
  const team = controller?.team;
  const enemyTeam = game.otherTeam(team);
  const filter = spec.filter || {};
  const opts = [];
  const addUnit = (u) => {
    if (!u || u.dead) return;
    if (filter.excludeChosen && (ctx.chosenTargets || []).some((chosen) => chosen?.uid === u.uid)) return;
    if (!matchesFilter(game, u, { ...filter, excludeSource: filter.excludeSource === 'self' ? ctx.source : filter.excludeSource })) return;
    opts.push({ id: `u:${u.uid}`, kind: 'unit', label: `${u.name} (${game.power(u)}|${game.health(u)})`, cardId: u.cardId, uid: u.uid });
  };
  const addNexus = (t, label) => opts.push({ id: `n:${t}`, kind: 'nexus', team: t, label: `${label} (${game.teams[t].nexus})` });
  const addHandCard = (handCard) => {
    if (!handCard) return;
    const card = game.cardDB.get(handCard.cardId);
    if (!card) return;
    opts.push({ id: `h:${handCard.iid}`, kind: 'hand', label: `${card.name} (${card.cost})`, cardId: card.id });
  };
  const addEntity = (entity) => {
    if (!entity) return;
    if (entity.nexus) {
      const label = entity.nexus === team ? 'Your Nexus' : 'Enemy Nexus';
      addNexus(entity.nexus, label);
    } else if (entity.uid) {
      addUnit(entity);
    } else if (entity.handCard) {
      addHandCard(entity.handCard);
    }
  };
  const allyUnits = () => game.unitsOnTeam(team).filter((u) => !u.isLandmark || spec.type.includes('Landmark'));
  const enemyUnits = () => game.unitsOnTeam(enemyTeam).filter((u) => !u.isLandmark || spec.type.includes('Landmark'));
  switch (spec.type) {
    case 'none': return [];
    case 'self': return ctx.source ? [{ id: `u:${ctx.source.uid}`, kind: 'unit', label: ctx.source.name, uid: ctx.source.uid }] : [];
    case 'attacker': return ctx.combat?.attacker ? [{ id: `u:${ctx.combat.attacker.uid}`, kind: 'unit', label: ctx.combat.attacker.name, uid: ctx.combat.attacker.uid }] : [];
    case 'blocker': return ctx.combat?.blocker ? [{ id: `u:${ctx.combat.blocker.uid}`, kind: 'unit', label: ctx.combat.blocker.name, uid: ctx.combat.blocker.uid }] : [];
    case 'strikeTarget': return ctx.combat?.target ? [{ id: `u:${ctx.combat.target.uid}`, kind: 'unit', label: ctx.combat.target.name, uid: ctx.combat.target.uid }] : [];
    case 'supporter': return ctx.supporter ? [{ id: `u:${ctx.supporter.uid}`, kind: 'unit', label: ctx.supporter.name, uid: ctx.supporter.uid }] : [];
    case 'supported': return ctx.supported ? [{ id: `u:${ctx.supported.uid}`, kind: 'unit', label: ctx.supported.name, uid: ctx.supported.uid }] : [];
    case 'allyNexus': return [{ id: `n:${team}`, kind: 'nexus', team, label: 'Your Nexus' }];
    case 'enemyNexus': return [{ id: `n:${enemyTeam}`, kind: 'nexus', team: enemyTeam, label: 'Enemy Nexus' }];
    case 'anyNexus': return [{ id: `n:${team}`, kind: 'nexus', team, label: 'Your Nexus' }, { id: `n:${enemyTeam}`, kind: 'nexus', team: enemyTeam, label: 'Enemy Nexus' }];
    case 'anyTarget': return [...targetOptions(game, 'anyUnit', ctx), ...targetOptions(game, 'anyNexus', ctx)];
    case 'allyTarget': {
      allyUnits().forEach(addUnit);
      addNexus(team, 'Your Nexus');
      break;
    }
    case 'allyUnit': allyUnits().forEach(addUnit); break;
    case 'otherAllyUnit': allyUnits().filter((u) => u !== ctx.source).forEach(addUnit); break;
    case 'enemyUnit': enemyUnits().forEach(addUnit); break;
    case 'anyUnit': [...allyUnits(), ...enemyUnits()].forEach(addUnit); break;
    case 'randomAllyUnit': allyUnits().forEach(addUnit); break;
    case 'randomOtherAllyUnit': allyUnits().filter((u) => u !== ctx.source).forEach(addUnit); break;
    case 'randomEnemyUnit': enemyUnits().forEach(addUnit); break;
    case 'randomUnit': [...allyUnits(), ...enemyUnits()].forEach(addUnit); break;
    case 'strongestAlly':
    case 'weakestAlly':
      return allyUnits().filter((u) => matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'strongestEnemy':
    case 'weakestEnemy':
      return enemyUnits().filter((u) => matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allyChampion': allyUnits().filter((u) => u.card?.supertype === 'Champion').forEach(addUnit); break;
    case 'enemyChampion': enemyUnits().filter((u) => u.card?.supertype === 'Champion').forEach(addUnit); break;
    case 'allyFollower': allyUnits().filter((u) => u.card?.supertype !== 'Champion').forEach(addUnit); break;
    case 'enemyFollower': enemyUnits().filter((u) => u.card?.supertype !== 'Champion').forEach(addUnit); break;
    case 'allyLandmark': game.unitsOnTeam(team).filter((u) => u.isLandmark).forEach(addUnit); break;
    case 'enemyLandmark': game.unitsOnTeam(enemyTeam).filter((u) => u.isLandmark).forEach(addUnit); break;
    case 'handCard':
      for (const h of controller.hand) {
        const c = game.cardDB.get(h.cardId);
        if (!c) continue;
        if (!matchesCardFilter(game, c, filter)) continue;
        addHandCard(h);
      }
      break;
    case 'lastTargets':
      for (const entity of ctx.lastTargets || []) addEntity(entity);
      break;
    case 'lastRecalled':
      if (ctx.lastRecalled?.handCard) addHandCard(ctx.lastRecalled.handCard);
      break;
    case 'eventUnit': {
      const entity = ctx.unit || ctx.target || ctx.summoned || ctx.healed || ctx.recalled || null;
      if (entity?.uid) addUnit(entity);
      break;
    }
    case 'allAllyUnits': return allyUnits().filter((u) => matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allOtherAllyUnits': return allyUnits().filter((u) => u !== ctx.source && matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allEnemyUnits': return enemyUnits().filter((u) => matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allOtherEnemyUnits': return enemyUnits().filter((u) => u !== ctx.source && matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allUnits': return [...game.unitsOnTeam(team), ...game.unitsOnTeam(enemyTeam)].filter((u) => !u.isLandmark && matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allDamagedAllyUnits': return allyUnits().filter((u) => u.damage > 0 && matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allDamagedEnemyUnits': return enemyUnits().filter((u) => u.damage > 0 && matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allChampionAllies': return allyUnits().filter((u) => u.card?.supertype === 'Champion' && matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allChampionEnemies': return enemyUnits().filter((u) => u.card?.supertype === 'Champion' && matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allBattlingUnits': {
      const list = [...(ctx.combat ? [ctx.combat.attacker, ctx.combat.blocker].filter(Boolean) : [])];
      return list.map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    }
    case 'allAttackingUnits': return (ctx.combat?.attackers || []).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allDefendingUnits': return (ctx.combat?.blockers || []).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    default:
      // Never silently broaden an unknown target to both boards. Semantic lint
      // rejects these before a script reaches the engine; this is the last line
      // of defence for hand-edited or peer-supplied data.
      game.log(`Unknown target type "${spec.type}" — effect has no targets.`, 'error');
      return [];
  }
  return opts;
}

export function autoTargetIds(game, rawSpec, ctx) {
  const spec = normalizeTarget(rawSpec);
  const controller = ctx.controller;
  const team = controller?.team;
  const enemyTeam = game.otherTeam(team);
  const opts = targetOptions(game, spec, ctx);
  const pick = (n = 1) => game.shuffle(opts.slice()).slice(0, n);
  switch (spec.type) {
    case 'self': return ctx.source ? [`u:${ctx.source.uid}`] : [];
    case 'attacker': return ctx.combat?.attacker ? [`u:${ctx.combat.attacker.uid}`] : [];
    case 'blocker': return ctx.combat?.blocker ? [`u:${ctx.combat.blocker.uid}`] : [];
    case 'strikeTarget': return ctx.combat?.target ? [`u:${ctx.combat.target.uid}`] : [];
    case 'supporter': return ctx.supporter ? [`u:${ctx.supporter.uid}`] : [];
    case 'supported': return ctx.supported ? [`u:${ctx.supported.uid}`] : [];
    case 'allyNexus': return [`n:${team}`];
    case 'enemyNexus': return [`n:${enemyTeam}`];
    case 'anyNexus': return [`n:${enemyTeam}`];
    case 'allAllyUnits': case 'allOtherAllyUnits': case 'allEnemyUnits': case 'allOtherEnemyUnits': case 'allUnits':
    case 'allDamagedAllyUnits': case 'allDamagedEnemyUnits':
    case 'allChampionAllies': case 'allChampionEnemies':
      return opts.map((o) => o.id);
    case 'allBattlingUnits': case 'allAttackingUnits': case 'allDefendingUnits':
      return opts.map((o) => o.id);
    case 'strongestAlly': {
      const u = game.unitsOnTeam(team).sort((a, b) => game.power(b) - game.power(a))[0];
      return u ? [`u:${u.uid}`] : [];
    }
    case 'weakestAlly': {
      const u = game.unitsOnTeam(team).sort((a, b) => game.power(a) - game.power(b))[0];
      return u ? [`u:${u.uid}`] : [];
    }
    case 'strongestEnemy': {
      const u = game.unitsOnTeam(enemyTeam).sort((a, b) => game.power(b) - game.power(a))[0];
      return u ? [`u:${u.uid}`] : [];
    }
    case 'weakestEnemy': {
      const u = game.unitsOnTeam(enemyTeam).sort((a, b) => game.power(a) - game.power(b))[0];
      return u ? [`u:${u.uid}`] : [];
    }
    case 'randomAllyUnit': case 'randomOtherAllyUnit': {
      const u = pick()[0];
      return u ? [u.id] : [];
    }
    case 'randomEnemyUnit': case 'randomUnit': {
      const u = pick()[0];
      return u ? [u.id] : [];
    }
    default:
      if (targetNeedsChoice(spec.type)) {
        const u = pick(spec.count);
        return u.map((o) => o.id);
      }
      return opts.slice(0, spec.count).map((o) => o.id);
  }
}

export function resolveEntity(game, id) {
  if (!id) return null;
  const [kind, key] = String(id).split(':');
  if (kind === 'u') return game.unitById(key);
  if (kind === 'n') return { nexus: key };
  if (kind === 'h') {
    for (const p of game.players.values()) {
      const h = p.hand.find((x) => x.iid === key);
      if (h) return { handCard: h, player: p };
    }
  }
  return null;
}

function matchesCardFilter(game, card, filter = {}) {
  if (!card) return false;
  if (Array.isArray(filter.types) && filter.types.length) {
    return filter.types.some((type) => matchesCardFilter(game, card, { ...filter, type, types: null }));
  }
  const type = filter.type;
  if (type && type !== 'any') {
    if (type === 'champion') {
      if (card.supertype !== 'Champion') return false;
    } else if (type === 'follower') {
      if (card.type !== 'Unit' || card.supertype === 'Champion') return false;
    } else if (type === 'landmark') {
      if (card.type !== 'Landmark') return false;
    } else if (type === 'equipment') {
      if (card.type !== 'Equipment') return false;
    } else if (type === 'unit') {
      if (card.type !== 'Unit' && card.type !== 'Champion') return false;
    } else if (type === 'spell') {
      if (card.type !== 'Spell') return false;
    } else if (card.type !== type) {
      return false;
    }
  }
  if (filter.region && !(card.regions || []).includes(filter.region)) return false;
  if (filter.subtype && !(card.subtypes || []).includes(filter.subtype)) return false;
  if (filter.supertype && card.supertype !== filter.supertype) return false;
  if (filter.keyword) {
    const key = canonicalKeyword(filter.keyword);
    const keywords = (card.keywords || []).map(canonicalKeyword);
    const escaped = String(filter.keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const textMatch = new RegExp(`\\b${escaped}\\b`, 'i').test(card.text || '');
    if (!keywords.includes(key) && !textMatch) return false;
  }
  if (filter.minCost != null && (card.cost ?? 0) < filter.minCost) return false;
  if (filter.maxCost != null && (card.cost ?? 0) > filter.maxCost) return false;
  return true;
}

export function evalCondition(game, condition, ctx = {}) {
  if (!condition) return true;
  const c = condition;
  const controller = ctx.controller;
  const team = controller?.team;
  const enemyTeam = team ? game.otherTeam(team) : null;
  const source = ctx.source;
  const cmp = (a, op, b) => {
    switch (op) {
      case '>': return a > b;
      case '>=': return a >= b;
      case '<': return a < b;
      case '<=': return a <= b;
      case '==': case '=': return a === b;
      case '!=': return a !== b;
      default: return a >= b;
    }
  };
  switch (c.type) {
    case 'always': return true;
    case 'not': return !evalCondition(game, c.condition, ctx);
    case 'and': return (c.conditions || []).every((x) => evalCondition(game, x, ctx));
    case 'or': return (c.conditions || []).some((x) => evalCondition(game, x, ctx));
    case 'allyCount': {
      const units = game.unitsOnTeam(team).filter((u) => matchesFilter(game, u, c.filter || {}));
      return cmp(units.length, c.op || '>=', c.value ?? 1);
    }
    case 'enemyCount': {
      const units = game.unitsOnTeam(enemyTeam).filter((u) => matchesFilter(game, u, c.filter || {}));
      return cmp(units.length, c.op || '>=', c.value ?? 1);
    }
    case 'boardCount': return cmp(game.unitsOnTeam(team).length, c.op || '>=', c.value ?? 1);
    case 'selfPower': return source ? cmp(game.power(source), c.op || '>=', c.value ?? 0) : false;
    case 'selfHealth': return source ? cmp(game.health(source), c.op || '>=', c.value ?? 0) : false;
    case 'selfMaxHealth': return source ? cmp(game.maxHealth(source), c.op || '>=', c.value ?? 0) : false;
    case 'selfCost': return source ? cmp(source.card?.cost ?? 0, c.op || '>=', c.value ?? 0) : false;
    case 'hasKeyword': {
      const target = c.target === 'enemy' ? game.unitsOnTeam(enemyTeam)[0] : (c.target === 'source' ? source : source);
      return target ? game.hasKeyword(target, canonicalKeyword(c.keyword)) : false;
    }
    case 'sourceKeyword': return source ? game.hasKeyword(source, canonicalKeyword(c.keyword)) : false;
    case 'sourceDamaged': return source ? (c.value === false ? source.damage <= 0 : source.damage > 0) : false;
    case 'mana': return cmp(game.teams[team].maxMana, c.op || '>=', c.value ?? 1);
    case 'spellMana': return cmp(game.teams[team].spellMana, c.op || '>=', c.value ?? 1);
    case 'handCount': return cmp(controller.hand.length, c.op || '>=', c.value ?? 1);
    case 'enemyHandCount': {
      const others = game.playersOnTeam(enemyTeam);
      return cmp(Math.max(...others.map((p) => p.hand.length)), c.op || '>=', c.value ?? 1);
    }
    case 'deckCount': return cmp(controller.deck.length, c.op || '>=', c.value ?? 1);
    case 'nexusHealth': {
      const t = c.who === 'enemy' ? enemyTeam : team;
      return cmp(game.teams[t].nexus, c.op || '>=', c.value ?? 1);
    }
    case 'allyDiedThisRound': return (game.teams[team].alliesDiedThisRound || 0) > 0;
    case 'unitsDiedThisRound': return (game.teams[team].unitsDiedThisRound || 0) > 0;
    case 'cardsPlayedThisRound': return cmp(game.teams[team].cardsPlayedThisRound || 0, c.op || '>=', c.value ?? 1);
    case 'cardsDrawnThisRound': return cmp(controller.stats.cardsDrawnThisRound || 0, c.op || '>=', c.value ?? 1);
    case 'cardsDrawnInARoundThisGame': return cmp(controller.stats.maxCardsDrawnInRound || 0, c.op || '>=', c.value ?? 1);
    case 'damageTakenThisRound': return cmp(game.teams[team].damageTakenThisRound || 0, c.op || '>=', c.value ?? 1);
    case 'damageDealtThisRound': return cmp(game.teams[team].damageDealtThisRound || 0, c.op || '>=', c.value ?? 1);
    case 'spellsPlayedThisRound': return cmp(game.teams[team].spellsPlayedThisRound || 0, c.op || '>=', c.value ?? 1);
    case 'spellsPlayedThisGame': return cmp(controller.stats.spellsPlayed || 0, c.op || '>=', c.value ?? 1);
    case 'manaSpentOnSpellsThisGame': return cmp(controller.stats.spellManaSpent || 0, c.op || '>=', c.value ?? 0);
    case 'stunnedOrRecalled': return cmp(controller.stats.stunnedOrRecalled || 0, c.op || '>=', c.value ?? 1);
    case 'enlightened': return game.teams[team].maxMana >= 10;
    case 'deep': return controller.deck.length <= 15;
    case 'topDeckRegion': return (controller.deck[0] && game.cardDB.get(controller.deck[0])?.regions?.includes(c.region)) || false;
    case 'plunder': return !!game.teams[team].plunderedThisRound;
    case 'daybreak': return (game.teams[team].cardsPlayedThisRound || 0) === 0;
    case 'nightfall': return (game.teams[team].cardsPlayedThisRound || 0) > 0;
    case 'round': return cmp(game.round, c.op || '>=', c.value ?? 1);
    case 'sourceAttacking': return !!game.combat?.attackers?.includes(source);
    case 'sourceBlocking': return !!game.combat?.blockers?.includes(source);
    case 'sourceLeveled': return !!source?.leveled;
    case 'selfStrikesThisGame': return cmp(source?.strikesThisGame || 0, c.op || '>=', c.value ?? 1);
    case 'counter': return cmp(source?.counters?.[c.counter] || 0, c.op || '>=', c.value ?? 1);
    case 'eventTeam': {
      const entity = ctx.unit || ctx.equipped || ctx.target || ctx.summoned || ctx.healed || ctx.recalled || ctx.eventSource || null;
      if (!entity?.team) return false;
      return c.who === 'enemy' ? entity.team === enemyTeam : entity.team === team;
    }
    case 'eventNotSource': {
      const entity = ctx.unit || ctx.equipped || ctx.target || ctx.summoned || ctx.healed || ctx.recalled || ctx.eventSource || null;
      return !!entity && entity !== source;
    }
    case 'lastTargetFollower': {
      const unit = ctx.lastTargets?.[0];
      return !!unit && !unit.isLandmark && !unit.isEquipment && unit.card?.supertype !== 'Champion';
    }
    case 'targetChampion': return ctx.target?.card?.supertype === 'Champion';
    case 'event': return c.value == null || ctx.event === c.value;
    case 'eventCard': {
      const eventEntity = ctx.summoned || ctx.played || ctx.card || ctx.spell
        || ctx.equipment || ctx.target || null;
      return matchesCardFilter(game, eventEntity?.card || eventEntity, c.filter || {});
    }
    case 'firstTimeThisRound': {
      if (!controller) return false;
      const flag = c.flag || 'firstTime';
      controller.roundFlags = controller.roundFlags || {};
      if (controller.roundFlags[flag]) return false;
      controller.roundFlags[flag] = true;
      return true;
    }
    case 'firstTimeThisGame': {
      const holder = c.scope === 'source' ? source : controller;
      if (!holder) return false;
      const flag = c.flag || 'firstTime';
      holder.gameFlags = holder.gameFlags || {};
      if (holder.gameFlags[flag]) return false;
      holder.gameFlags[flag] = true;
      return true;
    }
    case 'equipsThisGame': return cmp(controller.stats.equipsThisGame || 0, c.op || '>=', c.value ?? 1);
    case 'sourceEquipped': return !!(source?.equipment?.length);
    case 'attackerEquipped': {
      const attackers = ctx.attackers || (ctx.attacker ? [ctx.attacker] : []);
      return attackers.some((u) => (u?.equipment || []).length > 0);
    }
    case 'behold': {
      if (!controller || !team) return false;
      const cards = [
        ...controller.hand.map((h) => game.cardDB.get(h.cardId)),
        ...game.unitsOnTeam(team).flatMap((u) => [u.card, ...(u.equipment || []).map((e) => e.card)]),
      ];
      return cards.some((card) => matchesCardFilter(game, card, c.filter || {}));
    }
    case 'healWasDamaged': return !!ctx.wasDamaged && ctx.healed?.team === team;
    case 'reputation': return cmp(controller.stats.damageToEnemyNexus || 0, c.op || '>=', c.value ?? 4);
    case 'allegiance': {
      const top = controller.deck[0] ? game.cardDB.get(controller.deck[0]) : null;
      if (!top) return false;
      const regions = c.region ? [c.region] : (source?.card?.regions || []);
      return regions.some((r) => (top.regions || []).includes(r));
    }
    case 'lurkActive': return !!game.teams[team].lurkActiveThisRound;
    case 'fated': return !!source && (game.hasKeyword(source, 'Fated') || /fated/i.test(source.card?.text || ''));
    case 'flow': return !!source && game.hasKeyword(source, 'Flow');
    case 'evolve': return !!source && game.hasKeyword(source, 'Evolve');
    case 'augment': return !!source && game.hasKeyword(source, 'Augment');
    case 'hallowed': return !!source && game.hasKeyword(source, 'Hallowed');
    case 'brash': return !!source && game.hasKeyword(source, 'Brash');
    case 'formidable': return !!source && game.hasKeyword(source, 'Formidable');
    default:
      game.log(`Unknown condition type "${c.type}" — treated as false.`, 'error');
      return false;
  }
}

function amountValue(game, action, ctx, target) {
  const a = action.amount ?? action.value ?? 0;
  if (typeof a === 'number') return a;
  if (typeof a === 'string') {
    switch (a) {
      case 'selfPower': return ctx.source ? game.power(ctx.source) : 0;
      case 'selfHealth': return ctx.source ? game.health(ctx.source) : 0;
      case 'selfMaxHealth': return ctx.source ? game.maxHealth(ctx.source) : 0;
      case 'targetHealth': return target?.uid ? game.health(target) : 0;
      case 'targetMaxHealth': return target?.uid ? game.maxHealth(target) : 0;
      case 'targetPower': return target?.uid ? game.power(target) : 0;
      case 'mana': return game.teams[ctx.controller.team].maxMana;
      case 'spellMana': return game.teams[ctx.controller.team].spellMana;
      case 'handCount': return ctx.controller.hand.length;
      case 'enemyHandCount': return Math.max(...game.playersOnTeam(game.otherTeam(ctx.controller.team)).map((p) => p.hand.length), 0);
      case 'deckCount': return ctx.controller.deck.length;
      case 'damageTaken': return ctx.source?.damage || 0;
      case 'round': return game.round;
      default: return Number(a) || 0;
    }
  }
  if (a && typeof a === 'object') {
    if (a.type === 'sourcePower') return ctx.source ? game.power(ctx.source) : 0;
    if (a.type === 'targetHealth') return target?.uid ? game.health(target) : 0;
    if (a.type === 'fixed') return a.value || 0;
  }
  return 0;
}

function applyToEntity(game, entity, fn) {
  if (!entity) return;
  if (entity.nexus) {
    fn({ nexus: entity.nexus });
    return;
  }
  if (entity.uid) {
    fn(entity);
    return;
  }
  if (entity.handCard) {
    fn(entity);
    return;
  }
}

export class EffectRunner {
  constructor(game) {
    this.game = game;
  }

  pump() {
    const game = this.game;
    if (game.pumping) return;
    game.pumping = true;
    game.eventsProcessed = 0;
    game.eventQueueGuardLogged = false;
    let guard = 0;
    try {
      while (!game.pending && guard++ < 20000) {
        if (!game.resolutionStack.length) {
          if (!game.eventQueue.length) break;
          if (game.eventsProcessed >= game.maxEventsPerPump) {
            const dropped = game.eventQueue.length;
            game.eventQueue.length = 0;
            game.log(`Event storm guard: dropped ${dropped} queued event(s) after ${game.maxEventsPerPump} dispatches.`, 'error');
            break;
          }
          const batch = game.eventQueue.shift();
          game.eventsProcessed++;
          // The batch was sorted active-team-first. Push entries and their
          // trigger arrays in reverse so the first sorted entry and its first
          // declared trigger resolve first on the LIFO stack.
          for (let i = batch.entries.length - 1; i >= 0; i--) {
            const entry = batch.entries[i];
            for (let j = entry.resolutions.length - 1; j >= 0; j--) {
              game.resolutionStack.push(entry.resolutions[j]);
            }
          }
          continue;
        }
        const res = game.resolutionStack[game.resolutionStack.length - 1];
        if (res.sourceDeadAtStart == null) res.sourceDeadAtStart = !!res.ctx.source?.dead;
        if (res.index >= res.actions.length) {
          game.resolutionStack.pop();
          if (res.onDone) res.onDone();
          continue;
        }
        // Source-death policy: a trigger already queued still resolves, but if
        // its source dies during this resolution, stop the remaining actions.
        // Death triggers are exempt because their source is dead by design.
        if (res.ctx.source?.uid && res.ctx.source.dead && !res.sourceDeadAtStart && res.ctx.event !== EVENTS.DEATH && !res.continueOnSourceDeath) {
          game.log(`${res.ctx.source.name} died during its ${res.ctx.event} trigger; remaining actions skipped.`, 'event');
          res.index = res.actions.length;
          continue;
        }
        const action = res.actions[res.index];
        const path = `${res.index}`;
        // Nested control-flow actions manage their own sub-resolutions.
        if (action.type === 'if') {
          res.index++;
          if (evalCondition(game, action.condition, res.ctx)) {
            if (action.actions?.length) {
              game.resolutionStack.push({ ...res, actions: action.actions, index: 0, chosen: new Map(), onDone: null, parent: res });
            }
          } else if (action.elseActions?.length) {
            game.resolutionStack.push({ ...res, actions: action.elseActions, index: 0, chosen: new Map(), onDone: null, parent: res });
          }
          continue;
        }
        if (action.type === 'random') {
          res.index++;
          const branches = action.branches || action.actions || [];
          if (branches.length) {
            const chosen = branches[Math.floor(game.rng() * branches.length)];
            const actions = Array.isArray(chosen) ? chosen : (chosen.actions || []);
            if (actions.length) game.resolutionStack.push({ ...res, actions, index: 0, chosen: new Map(), onDone: null, parent: res });
          }
          continue;
        }
        if (action.type === 'repeat') {
          res.index++;
          const times = Math.max(0, Math.min(10, amountValue(game, action, res.ctx) || action.count || 1));
          if (action.actions?.length) {
            for (let i = 0; i < times; i++) {
              game.resolutionStack.push({ ...res, actions: action.actions, index: 0, chosen: new Map(), onDone: null, parent: res });
            }
          }
          continue;
        }
        if (action.type === 'choose') {
          const options = Array.isArray(action.options) ? action.options : [];
          if (!options.length) {
            res.index++;
            game.log(`${res.ctx.source?.name || 'Effect'}: choose action has no options, effect skipped.`, 'effect');
            continue;
          }
          if (!res.chosen.has(path)) {
            if (res.auto || options.length === 1) {
              res.chosen.set(path, [options[0].id]);
            } else {
              const player = res.controller;
              game.pending = {
                playerId: player.id,
                playerName: player.name,
                prompt: action.prompt || 'Choose one',
                options: options.map((option) => ({ id: option.id, label: option.label || option.id, kind: 'branch' })),
                min: 1,
                max: 1,
                path,
                resolution: res,
              };
              game.log(`${player.name} is choosing an option…`, 'choice');
              this.pumpPending();
              return;
            }
          }
          res.index++;
          const chosenId = res.chosen.get(path)[0];
          const option = options.find((entry) => entry.id === chosenId);
          if (!option) {
            game.log(`Unknown choice option "${chosenId}" — effect skipped.`, 'error');
            continue;
          }
          const actions = [...(option.actions || []), ...(action.then || [])];
          if (actions.length) {
            game.resolutionStack.push({ ...res, actions, index: 0, chosen: new Map(), onDone: null, parent: res });
          }
          continue;
        }

        // Top-of-deck choices are resolved before the action executes so the
        // same pending-choice path works for manual and automatic scripts.
        if (action.type === 'pickFromTop') {
          const picked = this.prepareTopPick(res, action, path);
          if (picked === false) { res.index++; continue; }
          if (picked === null) return;
        }

        // Resolve targets (if any). Preset targets are consumed in action order.
        const resolvedTargets = this.resolveActionTargets(res, action, path);
        if (resolvedTargets === false) { res.index++; continue; }
        if (resolvedTargets === null) return;
        res.index++;
        try {
          this.execute(action, res, path);
        } catch (err) {
          game.log(`Effect error on ${res.ctx.source?.name || 'card'}: ${err.message}`, 'error');
          console.error(err);
        }
      }
    } finally {
      game.pumping = false;
    }
    if (game.pending) this.pumpPending();
  }

  pumpPending() {
    // Hook for the server to broadcast the new pending state.
    if (this.game.onPending) this.game.onPending();
  }

  resolveActionTargets(res, action, path) {
    const game = this.game;
    const fields = [];
    // The hand target is selected first so an equip effect with no legal
    // equipment can skip before asking the player to choose a bearer.
    if (action.handTarget) fields.push(['handTarget', action.handTarget, `${path}:hand`]);
    if (action.target) fields.push(['target', action.target, path]);
    if (action.secondaryTarget) fields.push(['secondaryTarget', action.secondaryTarget, `${path}:2`]);
    if (!fields.length) return true;
    if (res.targetPath !== path) {
      res.targetPath = path;
      res.ctx.chosenTargets = [];
    }
    for (const [field, rawSpec, key] of fields) {
      if (res.chosen.has(key)) continue;
      const spec = normalizeTarget(rawSpec);
      const count = spec.count || 1;
      if (res.presetTargets.length && targetNeedsChoice(spec.type)) {
        const ids = res.presetTargets.splice(0, count);
        res.chosen.set(key, ids);
        for (const id of ids) {
          const entity = resolveEntity(game, id);
          if (entity) res.ctx.chosenTargets.push(entity);
        }
        continue;
      }
      const options = targetOptions(game, spec, res.ctx);
      if (options.length < count) {
        game.log(`${res.ctx.source?.name || 'Effect'}: not enough legal targets for ${field}, effect skipped.`, 'effect');
        return false;
      }
      if (res.auto || game.isAutoChoice(spec.type)) {
        const ids = autoTargetIds(game, spec, res.ctx);
        if (ids.length < count) {
          game.log(`${res.ctx.source?.name || 'Effect'}: not enough legal targets for ${field}, effect skipped.`, 'effect');
          return false;
        }
        res.chosen.set(key, ids);
        for (const id of ids) {
          const entity = resolveEntity(game, id);
          if (entity) res.ctx.chosenTargets.push(entity);
        }
      } else {
        const player = res.controller;
        game.pending = {
          playerId: player.id,
          playerName: player.name,
          prompt: action.prompt || spec.prompt || promptForTarget(spec.type),
          options,
          min: count,
          max: count,
          path: key,
          resolution: res,
          filter: spec.filter || {},
        };
        game.log(`${player.name} is choosing a target…`, 'choice');
        this.pumpPending();
        return null;
      }
    }
    return true;
  }

  prepareTopPick(res, action, path) {
    if (res.chosen.has(path)) return true;
    const game = this.game;
    const controller = res.controller;
    const count = Math.max(1, Math.min(20, Number(action.count) || 4));
    const top = controller.deck.slice(0, count);
    const options = [];
    top.forEach((cardId, index) => {
      const card = game.cardDB.get(cardId);
      if (!matchesCardFilter(game, card, action.filter || {})) return;
      options.push({ id: `d:${index}:${cardId}`, label: `${card.name} (${card.cost})`, kind: 'deck', cardId });
    });
    res.pickData = { path, top };
    if (!options.length) {
      const text = `${controller.name} finds no matching card in the top ${count} of their deck.`;
      game.log(text, 'effect', controller.id, { privateTo: controller.id, publicText: `${controller.name} reveals no card.` });
      return false;
    }
    if (res.auto || options.length === 1) {
      res.chosen.set(path, [options[0].id]);
      return true;
    }
    game.pending = {
      playerId: controller.id,
      playerName: controller.name,
      prompt: action.prompt || `Choose a card from the top ${count} of your deck`,
      options,
      min: 1,
      max: 1,
      path,
      resolution: res,
    };
    game.log(`${controller.name} is choosing a card from the top of their deck…`, 'choice');
    this.pumpPending();
    return null;
  }

  execute(action, res, path) {
    const game = this.game;
    const controller = res.controller;
    const team = controller.team;
    const enemyTeam = game.otherTeam(team);
    const source = res.ctx.source;
    const pickTargets = (rawSpec, key) => {
      if (!rawSpec) return [];
      const ids = res.chosen.has(key) ? res.chosen.get(key) : autoTargetIds(game, rawSpec, res.ctx);
      return ids.map((id) => resolveEntity(game, id)).filter(Boolean);
    };
    const targets = pickTargets(action.target, path);
    const secondaryTargets = pickTargets(action.secondaryTarget, `${path}:2`);
    const handTargets = pickTargets(action.handTarget, `${path}:hand`);
    const target = targets[0] || null;
    const secondaryTarget = secondaryTargets[0] || null;
    const handTarget = handTargets[0] || null;
    if (targets.length) {
      res.ctx.lastTargets = targets;
      res.ctx.lastTarget = target;
    }
    const amount = amountValue(game, action, res.ctx, target);

    if (action.target && source?.isSpell) {
      for (const t of [...targets, ...secondaryTargets]) {
        if (t.uid) game.recordTargeting(t, { source, action: action.type, spell: true });
      }
    }

    switch (action.type) {
      case 'damage':
      case 'dealDamage': {
        const dead = [];
        for (const t of targets) {
          if (t.nexus) game.damageNexus(t.nexus, amount, source, { spell: res.ctx.event === 'cast', skill: true });
          else if (t.uid) {
            const dealt = game.damageUnit(t, amount, source, { spell: res.ctx.event === 'cast', skill: true, deathBatch: dead });
            if (source && game.hasKeyword(source, 'Lifesteal')) game.healNexus(team, dealt, source);
          }
        }
        if (dead.length) game.emitDeaths(dead, { source });
        break;
      }
      case 'damageAll': {
        const list = game.unitsOnTeam(action.team === 'enemy' ? enemyTeam : team).filter((u) => matchesFilter(game, u, action.filter || {}));
        const dead = [];
        for (const u of list) game.damageUnit(u, amount, source, { spell: true, skill: true, deathBatch: dead });
        if (dead.length) game.emitDeaths(dead, { source });
        if (action.includeNexus) game.damageNexus(action.team === 'enemy' ? enemyTeam : team, amount, source, { spell: true });
        break;
      }
      case 'damageNexus': {
        const t = action.who === 'ally' ? team : enemyTeam;
        game.damageNexus(t, amount, source, { spell: true, skill: true });
        break;
      }
      case 'heal':
      case 'healUnit': {
        for (const t of targets) {
          if (t.nexus) game.healNexus(t.nexus, amount, source);
          else if (t.uid) game.healUnit(t, amount, source);
        }
        break;
      }
      case 'healNexus': game.healNexus(action.who === 'enemy' ? enemyTeam : team, amount, source); break;
      case 'buff':
      case 'give': {
        for (const t of targets) {
          const power = action.power ?? action.attack ?? 0;
          const health = action.health ?? 0;
          const duration = action.duration || 'permanent';
          if (t.uid) game.buffUnit(t, power, health, duration, source);
          else if (t.handCard) game.buffHandCard(t.handCard, power, health, duration, source);
        }
        break;
      }
      case 'debuff': {
        for (const t of targets) {
          const power = -(action.power ?? 0);
          const health = -(action.health ?? 0);
          const duration = action.duration || 'permanent';
          if (t.uid) game.buffUnit(t, power, health, duration, source);
          else if (t.handCard) game.buffHandCard(t.handCard, power, health, duration, source);
        }
        break;
      }
      case 'grantKeyword': {
        for (const t of targets) {
          if (t.uid) game.grantKeyword(t, canonicalKeyword(action.keyword), action.duration || 'permanent');
          else if (t.handCard) game.grantKeywordToHandCard(t.handCard, canonicalKeyword(action.keyword));
        }
        break;
      }
      case 'removeKeyword': {
        for (const t of targets) if (t.uid) game.removeKeyword(t, canonicalKeyword(action.keyword));
        break;
      }
      case 'barrier': for (const t of targets) if (t.uid) game.grantStatus(t, 'barrier', source); break;
      case 'spellShield': for (const t of targets) if (t.uid) game.grantStatus(t, 'spellShield'); break;
      case 'stun': for (const t of targets) if (t.uid) game.stunUnit(t); break;
      case 'frostbite': for (const t of targets) if (t.uid) game.frostbiteUnit(t); break;
      case 'recall': for (const t of targets) if (t.uid) {
        const moved = game.recallUnit(t, source);
        if (moved) res.ctx.lastRecalled = moved;
      } break;
      case 'silence': for (const t of targets) if (t.uid) game.silenceUnit(t); break;
      case 'destroyEquipment':
      case 'detach': {
        for (const t of targets) {
          if (t.uid) game.detachEquipment(t, { source, reason: 'effect', destroy: action.type === 'destroyEquipment' });
        }
        break;
      }
      case 'moveToDeck': {
        for (const t of targets) {
          if (t.uid) game.moveUnitToDeck(t, { source, position: action.position || action.to || 'shuffle' });
        }
        break;
      }
      case 'equipFromHand': {
        const unit = target?.uid ? game.unitById(target.uid) : null;
        const handCard = handTarget?.handCard || null;
        const card = handCard ? game.cardDB.get(handCard.cardId) : null;
        if (!unit || unit.team !== team || !handCard || !card || card.type !== 'Equipment') {
          game.log(`${source?.name || 'Effect'}: no legal equipment target, effect skipped.`, 'effect');
          break;
        }
        const handIndex = controller.hand.findIndex((h) => h.iid === handCard.iid);
        if (handIndex < 0) break;
        controller.hand.splice(handIndex, 1);
        const equipped = game.equipCard(unit, card, controller, { source, fromHand: true });
        if (!equipped) controller.hand.splice(handIndex, 0, handCard);
        break;
      }
      case 'pickFromTop': {
        const chosenId = res.chosen.get(path)?.[0];
        if (!chosenId || !res.pickData || res.pickData.path !== path) break;
        const parts = String(chosenId).split(':');
        const cardId = parts[2];
        let index = Number(parts[1]);
        const deck = controller.deck;
        if (!Number.isInteger(index) || deck[index] !== cardId) index = deck.indexOf(cardId);
        if (index < 0 || !cardId) break;
        deck.splice(index, 1);
        if (action.rest !== 'keep') game.shuffleDeck(controller);
        game.addCardToHand(controller, cardId, { fromDeck: true });
        break;
      }
      case 'capture': {
        const captor = target?.uid ? game.unitById(target.uid) : null;
        const captured = secondaryTarget?.uid ? game.unitById(secondaryTarget.uid) : null;
        if (!captor || !captured || captor === captured || captor.team !== team) {
          game.log(`${source?.name || 'Effect'}: no legal capture pair, effect skipped.`, 'effect');
          break;
        }
        game.captureUnit(captor, captured, source);
        break;
      }
      case 'swap': {
        if (targets.length < 2) break;
        game.swapUnits(targets[0], targets[1]);
        break;
      }
      case 'nextSummon': {
        game.setNextSummon(controller, {
          keywords: Array.isArray(action.keywords) ? action.keywords : [],
          power: action.power ?? 0,
          health: action.health ?? 0,
          source,
          name: source?.name || 'Next summon',
        });
        break;
      }
      case 'addCounter': {
        const list = targets.length ? targets : (source ? [{ uid: source.uid }] : []);
        for (const t of list) {
          if (!t.uid) continue;
          const unit = game.unitById(t.uid);
          if (unit) game.addCounter(unit, action.counter, amount || 1);
        }
        break;
      }
      case 'kill': game.killUnits(targets.filter((t) => t?.uid), { source, reason: 'effect' }); break;
      case 'obliterate': for (const t of targets) if (t.uid) game.obliterateUnit(t); break;
      case 'draw': {
        const who = action.who === 'opponent' ? game.playersOnTeam(enemyTeam) : action.who === 'all' ? [...game.players.values()] : [controller];
        for (const p of who) game.drawCards(p, amount || 1, { fleeting: !!action.fleeting });
        break;
      }
      case 'discard': {
        const who = action.who === 'opponent' ? game.playersOnTeam(enemyTeam) : [controller];
        for (const p of who) game.discardCards(p, amount || 1, { random: action.random !== false, source, reason: 'effect' });
        break;
      }
      case 'summon': {
        const count = action.count || 1;
        for (let i = 0; i < count; i++) {
          const card = action.cardId ? game.cardDB.get(action.cardId) : game.cardDB.findToken(action.name || action.cardName || '');
          if (!card) { game.log(`Unknown token: ${action.name || action.cardId}`, 'error'); break; }
          game.summonUnit(card, controller, { source, token: true });
        }
        break;
      }
      case 'create': {
        const count = action.count || 1;
        for (let i = 0; i < count; i++) {
          let card = action.cardId ? game.cardDB.get(action.cardId) : game.cardDB.findToken(action.name || action.cardName || '');
          if (!card && action.filter) card = game.randomCard(action.filter, controller);
          if (!card) { game.log(`Unknown card to create: ${action.name || action.cardId}`, 'error'); break; }
          game.createCard(controller, card, { destination: action.destination || 'hand', fleeting: !!action.fleeting, source });
        }
        break;
      }
      case 'createRandom': {
        for (let i = 0; i < (action.count || 1); i++) {
          const card = game.randomCard(action.filter || {}, controller);
          if (card) game.createCard(controller, card, { destination: action.destination || 'hand', fleeting: !!action.fleeting, source });
        }
        break;
      }
      case 'mana': game.addMana(team, amount); break;
      case 'spellMana': game.addSpellMana(team, amount); break;
      case 'emptyManaGem': game.addManaGem(team); break;
      case 'rally': game.rally(team); break;
      case 'strike': {
        const striker = action.striker === 'eventCard'
          ? (res.ctx.played || res.ctx.summoned || res.ctx.card || res.ctx.spell || res.ctx.equipment || res.ctx.target)
          : source;
        if (striker && target) game.strike(striker, target, { combat: false, effect: true });
        break;
      }
      case 'fight': {
        if (source && target?.uid) {
          game.strike(source, target, { combat: false, effect: true, simultaneous: true });
          if (!target.dead) game.strike(target, source, { combat: false, effect: true, simultaneous: true });
        }
        break;
      }
      case 'levelUp': if (source) game.levelUp(source); break;
      case 'transform': {
        if (!action.cardId) break;
        if (target?.handCard) game.transformHandCard(target.handCard, action.cardId);
        else if (source) game.transformUnit(source, action.cardId);
        break;
      }
      case 'copy': {
        if (source && target?.uid) game.copyUnit(target, controller);
        break;
      }
      case 'toss': game.toss(controller, amount || 1); break;
      case 'predict': game.predict(controller, action.count || 3); break;
      case 'counter': game.counterTopStack(); break;
      case 'shuffle': game.shuffleDeck(controller); break;
      case 'addToHandFromDeck': {
        if (!controller.deck.length) break;
        const idx = Math.floor(game.rng() * controller.deck.length);
        const cardId = controller.deck.splice(idx, 1)[0];
        game.addCardToHand(controller, cardId, { fromDeck: true });
        break;
      }
      case 'log': game.log(action.text || '', 'effect'); break;
      case 'noop': break;
      default:
        game.log(`Unknown effect action: ${action.type}`, 'error');
    }
    const after = () => {
      if (action.then && Array.isArray(action.then) && action.then.length) {
        game.resolutionStack.push({ ...res, actions: action.then, index: 0, chosen: new Map(), onDone: null, parent: res });
      }
    };
    after();
  }
}

export function promptForTarget(type) {
  const map = {
    allyUnit: 'Choose an ally',
    otherAllyUnit: 'Choose another ally',
    enemyUnit: 'Choose an enemy',
    anyUnit: 'Choose a unit',
    anyTarget: 'Choose a target',
    allyChampion: 'Choose an allied champion',
    enemyChampion: 'Choose an enemy champion',
    allyFollower: 'Choose an allied follower',
    enemyFollower: 'Choose an enemy follower',
    allyLandmark: 'Choose an allied landmark',
    enemyLandmark: 'Choose an enemy landmark',
    anyNexus: 'Choose a Nexus',
    allyTarget: 'Choose an ally or your Nexus',
    handCard: 'Choose a card in hand',
    lastTargets: 'Choose the previous target',
    lastRecalled: 'Choose the recalled card',
    eventUnit: 'Choose the triggering unit',
  };
  return map[type] || 'Choose a target';
}

export function targetSpecsForScript(script) {
  if (!script?.triggers || script.deferTargets) return [];
  const specs = [];
  const visit = (actions) => {
    for (const action of actions || []) {
      for (const key of ['handTarget', 'target', 'secondaryTarget']) {
        const raw = action[key];
        if (raw && targetNeedsChoice(normalizeTarget(raw).type)) {
          const spec = normalizeTarget(raw);
          specs.push({ ...spec, prompt: action.prompt || spec.prompt || promptForTarget(spec.type), actionType: action.type });
        }
      }
      visit(action.actions);
      visit(action.elseActions);
      visit(action.then);
      for (const branch of action.branches || []) visit(Array.isArray(branch) ? branch : branch.actions);
    }
  };
  for (const trigger of script.triggers) {
    if (![EVENTS.PLAY, EVENTS.SUMMON, 'cast', EVENTS.LEVEL_UP].includes(trigger.on)) continue;
    visit(trigger.actions);
  }
  return specs;
}

export function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
export { clamp };
