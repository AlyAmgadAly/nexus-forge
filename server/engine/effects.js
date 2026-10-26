// Data-driven effect interpreter (DSL) used by Riot cards, custom cards and the admin forge.
// A script looks like:
//   { triggers: [{ on: "play", condition: {...}, actions: [{ type: "damage", amount: 2, target: "enemyUnit" }] }] }
// Targets are resolved lazily. Top-level plays can prompt the controller; triggers auto-resolve.
import { canonicalKeyword, clamp } from './constants.js';

const CHOICE_TARGETS = new Set([
  'allyUnit', 'otherAllyUnit', 'enemyUnit', 'anyUnit', 'chosenUnit', 'chosenAlly', 'chosenEnemy',
  'anyNexus', 'anyTarget', 'allyChampion', 'enemyChampion', 'allyFollower', 'enemyFollower',
  'allyLandmark', 'enemyLandmark', 'handCard', 'deckChoice', 'allyEquipment', 'enemyEquipment',
]);

const AUTO_TARGETS = new Set([
  'self', 'owner', 'allyNexus', 'enemyNexus', 'strongestAlly', 'weakestAlly', 'strongestEnemy',
  'weakestEnemy', 'randomAllyUnit', 'randomEnemyUnit', 'randomUnit', 'randomOtherAllyUnit',
  'allAllyUnits', 'allEnemyUnits', 'allUnits', 'allOtherAllyUnits', 'allOtherEnemyUnits',
  'allAttackingUnits', 'allDefendingUnits', 'allBattlingUnits', 'allDamagedAllyUnits',
  'allDamagedEnemyUnits', 'allChampionAllies', 'allChampionEnemies', 'attacker', 'blocker',
  'strikeTarget', 'topDeck', 'bottomDeck', 'none',
]);

export function targetNeedsChoice(type) {
  return CHOICE_TARGETS.has(type) || (!AUTO_TARGETS.has(type) && type !== 'allAllies' && type !== 'allEnemies');
}

export function normalizeTarget(spec) {
  if (!spec) return { type: 'none', count: 1, filter: {} };
  if (typeof spec === 'string') return { type: spec, count: 1, filter: {} };
  return { type: spec.type || 'none', count: spec.count ?? 1, filter: spec.filter || {}, prompt: spec.prompt };
}

export function getTriggerEntries(script, event) {
  if (!script?.triggers) return [];
  return script.triggers.filter((t) => t.on === event);
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
  if (filter.excludeSource && unit === filter.excludeSource) return false;
  if (filter.excludeUid && unit.uid === filter.excludeUid) return false;
  if (filter.champion === true && unit.card?.supertype !== 'Champion') return false;
  if (filter.champion === false && unit.card?.supertype === 'Champion') return false;
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
    if (!matchesFilter(game, u, { ...filter, excludeSource: filter.excludeSource === 'self' ? ctx.source : filter.excludeSource })) return;
    opts.push({ id: `u:${u.uid}`, kind: 'unit', label: `${u.name} (${game.power(u)}|${game.health(u)})`, cardId: u.cardId, uid: u.uid });
  };
  const addNexus = (t, label) => opts.push({ id: `n:${t}`, kind: 'nexus', team: t, label: `${label} (${game.teams[t].nexus})` });
  const allyUnits = () => game.unitsOnTeam(team).filter((u) => !u.isLandmark || spec.type.includes('Landmark'));
  const enemyUnits = () => game.unitsOnTeam(enemyTeam).filter((u) => !u.isLandmark || spec.type.includes('Landmark'));
  switch (spec.type) {
    case 'self': return ctx.source ? [{ id: `u:${ctx.source.uid}`, kind: 'unit', label: ctx.source.name, uid: ctx.source.uid }] : [];
    case 'attacker': return ctx.combat?.attacker ? [{ id: `u:${ctx.combat.attacker.uid}`, kind: 'unit', label: ctx.combat.attacker.name, uid: ctx.combat.attacker.uid }] : [];
    case 'blocker': return ctx.combat?.blocker ? [{ id: `u:${ctx.combat.blocker.uid}`, kind: 'unit', label: ctx.combat.blocker.name, uid: ctx.combat.blocker.uid }] : [];
    case 'strikeTarget': return ctx.combat?.target ? [{ id: `u:${ctx.combat.target.uid}`, kind: 'unit', label: ctx.combat.target.name, uid: ctx.combat.target.uid }] : [];
    case 'allyNexus': return [{ id: `n:${team}`, kind: 'nexus', team, label: 'Your Nexus' }];
    case 'enemyNexus': return [{ id: `n:${enemyTeam}`, kind: 'nexus', team: enemyTeam, label: 'Enemy Nexus' }];
    case 'anyNexus': return [{ id: `n:${team}`, kind: 'nexus', team, label: 'Your Nexus' }, { id: `n:${enemyTeam}`, kind: 'nexus', team: enemyTeam, label: 'Enemy Nexus' }];
    case 'anyTarget': return [...targetOptions(game, 'anyUnit', ctx), ...targetOptions(game, 'anyNexus', ctx)];
    case 'allyUnit': allyUnits().forEach(addUnit); break;
    case 'otherAllyUnit': allyUnits().filter((u) => u !== ctx.source).forEach(addUnit); break;
    case 'enemyUnit': enemyUnits().forEach(addUnit); break;
    case 'anyUnit': [...allyUnits(), ...enemyUnits()].forEach(addUnit); break;
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
        if (filter.maxCost != null && c.cost > filter.maxCost) continue;
        if (filter.minCost != null && c.cost < filter.minCost) continue;
        if (filter.type && filter.type !== 'any' && c.type !== filter.type) continue;
        opts.push({ id: `h:${h.iid}`, kind: 'hand', label: `${c.name} (${c.cost})`, cardId: c.id });
      }
      break;
    case 'allAllyUnits': return allyUnits().filter((u) => matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allOtherAllyUnits': return allyUnits().filter((u) => u !== ctx.source && matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allEnemyUnits': return enemyUnits().filter((u) => matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allOtherEnemyUnits': return enemyUnits().filter((u) => u !== ctx.source && matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allUnits': return [...game.unitsOnTeam('A'), ...game.unitsOnTeam('B')].filter((u) => matchesFilter(game, u, filter)).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allBattlingUnits': {
      const list = [...(ctx.combat ? [ctx.combat.attacker, ctx.combat.blocker].filter(Boolean) : [])];
      return list.map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    }
    case 'allAttackingUnits': return (ctx.combat?.attackers || []).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    case 'allDefendingUnits': return (ctx.combat?.blockers || []).map((u) => ({ id: `u:${u.uid}`, kind: 'unit', label: u.name, uid: u.uid }));
    default:
      // Fall back to all units for unknown explicit target types, useful for custom cards.
      [...allyUnits(), ...enemyUnits()].forEach(addUnit);
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
    case 'allyNexus': return [`n:${team}`];
    case 'enemyNexus': return [`n:${enemyTeam}`];
    case 'anyNexus': return [`n:${enemyTeam}`];
    case 'allAllyUnits': case 'allOtherAllyUnits': case 'allEnemyUnits': case 'allOtherEnemyUnits': case 'allUnits':
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
    case 'targetChampion': return ctx.target?.card?.supertype === 'Champion';
    case 'event': return c.value == null || ctx.event === c.value;
    case 'firstTimeThisRound': return !controller.flags?.[c.flag || 'firstTime'];
    case 'custom': return true; // custom conditions are resolved by admin JS extensions
    default: return true;
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

  // Runs a script trigger. Returns true if a choice paused the runner.
  run({ script, event, source, controller, presetTargets = [], auto = false, onDone = null, eventCtx = {} }) {
    const entries = getTriggerEntries(script, event);
    if (!entries.length) {
      if (onDone) onDone();
      return false;
    }
    let remaining = entries.length;
    for (const trigger of entries) {
      const ctx = {
        event,
        source,
        controller,
        target: eventCtx.target || null,
        killer: eventCtx.killer || null,
        combat: eventCtx.combat || this.game.combat || null,
        ...eventCtx,
      };
      if (!evalCondition(this.game, trigger.condition, ctx)) {
        remaining--;
        continue;
      }
      const resolution = {
        script,
        trigger,
        controller,
        actions: trigger.actions || [],
        index: 0,
        chosen: new Map(),
        ctx,
        auto: auto || !!trigger.auto,
        presetTargets: [...presetTargets],
        onDone: () => {
          remaining--;
          if (remaining <= 0 && onDone) onDone();
        },
      };
      this.game.resolutionStack.push(resolution);
    }
    if (!this.game.resolutionStack.length) {
      if (onDone) onDone();
      return false;
    }
    this.pump();
    return !!this.game.pending;
  }

  pump() {
    const game = this.game;
    if (game.pumping) return;
    game.pumping = true;
    let guard = 0;
    try {
      while (game.resolutionStack.length && !game.pending && guard++ < 20000) {
        const res = game.resolutionStack[game.resolutionStack.length - 1];
        if (res.index >= res.actions.length) {
          game.resolutionStack.pop();
          if (res.onDone) res.onDone();
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

        // Resolve target (if any). Preset targets are consumed in action order.
        let targetSpec = action.target;
        if (targetSpec) {
          if (res.presetTargets.length && targetNeedsChoice(normalizeTarget(targetSpec).type) && !res.chosen.has(path)) {
            const count = normalizeTarget(targetSpec).count || 1;
            const ids = res.presetTargets.splice(0, count);
            res.chosen.set(path, ids);
          }
          const spec = normalizeTarget(targetSpec);
          if (!res.chosen.has(path)) {
            const options = targetOptions(game, spec, res.ctx);
            if (!options.length) {
              // No legal target: skip the action instead of stalling the game.
              res.index++;
              game.log(`${res.ctx.source?.name || 'Effect'}: no legal target, effect skipped.`, 'effect');
              continue;
            }
            if (res.auto || game.isAutoChoice(spec.type)) {
              res.chosen.set(path, autoTargetIds(game, spec, res.ctx));
            } else {
              const player = res.controller;
              game.pending = {
                playerId: player.id,
                playerName: player.name,
                prompt: action.prompt || spec.prompt || promptForTarget(spec.type),
                options,
                min: spec.count || 1,
                max: spec.count || 1,
                path,
                resolution: res,
                filter: spec.filter || {},
              };
              game.log(`${player.name} is choosing a target…`, 'choice');
              this.pumpPending();
              return;
            }
          }
        }
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

  execute(action, res, path) {
    const game = this.game;
    const controller = res.controller;
    const team = controller.team;
    const enemyTeam = game.otherTeam(team);
    const source = res.ctx.source;
    let targets = [];
    if (res.chosen.has(path)) {
      targets = res.chosen.get(path).map((id) => resolveEntity(game, id)).filter(Boolean);
    }
    if (action.target && !targets.length) {
      targets = autoTargetIds(game, action.target, res.ctx).map((id) => resolveEntity(game, id)).filter(Boolean);
    }
    const target = targets[0] || null;
    const amount = amountValue(game, action, res.ctx, target);

    switch (action.type) {
      case 'damage':
      case 'dealDamage': {
        for (const t of targets) {
          if (t.nexus) game.damageNexus(t.nexus, amount, source, { spell: res.ctx.event === 'cast', skill: true });
          else if (t.uid) {
            const dealt = game.damageUnit(t, amount, source, { spell: res.ctx.event === 'cast', skill: true });
            if (source && game.hasKeyword(source, 'Lifesteal')) game.healNexus(team, dealt);
          }
        }
        break;
      }
      case 'damageAll': {
        const list = game.unitsOnTeam(action.team === 'enemy' ? enemyTeam : team).filter((u) => matchesFilter(game, u, action.filter || {}));
        for (const u of list) game.damageUnit(u, amount, source, { spell: true, skill: true });
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
          if (t.nexus) game.healNexus(t.nexus, amount);
          else if (t.uid) game.healUnit(t, amount);
        }
        break;
      }
      case 'healNexus': game.healNexus(action.who === 'enemy' ? enemyTeam : team, amount); break;
      case 'buff':
      case 'give': {
        for (const t of targets) {
          if (!t.uid) continue;
          game.buffUnit(t, action.power ?? action.attack ?? 0, action.health ?? 0, action.duration || 'permanent', source);
        }
        break;
      }
      case 'debuff': {
        for (const t of targets) {
          if (!t.uid) continue;
          game.buffUnit(t, -(action.power ?? 0), -(action.health ?? 0), action.duration || 'permanent', source);
        }
        break;
      }
      case 'grantKeyword': {
        for (const t of targets) {
          if (t.uid) game.grantKeyword(t, canonicalKeyword(action.keyword), action.duration || 'permanent');
        }
        break;
      }
      case 'removeKeyword': {
        for (const t of targets) if (t.uid) game.removeKeyword(t, canonicalKeyword(action.keyword));
        break;
      }
      case 'barrier': for (const t of targets) if (t.uid) game.grantStatus(t, 'barrier'); break;
      case 'spellShield': for (const t of targets) if (t.uid) game.grantStatus(t, 'spellShield'); break;
      case 'stun': for (const t of targets) if (t.uid) game.stunUnit(t); break;
      case 'frostbite': for (const t of targets) if (t.uid) game.frostbiteUnit(t); break;
      case 'recall': for (const t of targets) if (t.uid) game.recallUnit(t); break;
      case 'silence': for (const t of targets) if (t.uid) game.silenceUnit(t); break;
      case 'kill': for (const t of targets) if (t.uid) game.killUnit(t, { source, reason: 'effect' }); break;
      case 'obliterate': for (const t of targets) if (t.uid) game.obliterateUnit(t); break;
      case 'draw': {
        const who = action.who === 'opponent' ? game.playersOnTeam(enemyTeam) : action.who === 'all' ? [...game.players.values()] : [controller];
        for (const p of who) game.drawCards(p, amount || 1, { fleeting: !!action.fleeting });
        break;
      }
      case 'discard': {
        const who = action.who === 'opponent' ? game.playersOnTeam(enemyTeam) : [controller];
        for (const p of who) game.discardCards(p, amount || 1, { random: action.random !== false });
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
        if (source && target) game.strike(source, target, { combat: false, effect: true });
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
      case 'transform': if (source && action.cardId) game.transformUnit(source, action.cardId); break;
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
    handCard: 'Choose a card in hand',
  };
  return map[type] || 'Choose a target';
}

export function targetSpecsForScript(script) {
  if (!script?.triggers) return [];
  const specs = [];
  for (const trigger of script.triggers) {
    if (!['play', 'summon', 'cast', 'levelUp'].includes(trigger.on)) continue;
    for (const action of trigger.actions || []) {
      if (action.target && targetNeedsChoice(normalizeTarget(action.target).type)) {
        const spec = normalizeTarget(action.target);
        specs.push({ ...spec, prompt: action.prompt || spec.prompt || promptForTarget(spec.type), actionType: action.type });
      }
    }
  }
  return specs;
}

export function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
export { clamp };
