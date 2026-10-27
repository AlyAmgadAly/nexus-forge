// Semantic lint for the declarative effect DSL.
//
// validateScript() answers "is this bounded JSON with the right top-level
// shape?" This module answers "will the engine understand every trigger,
// action, target, and condition?" It is intentionally separate so callers can
// report shape errors and semantic errors independently.
import { validateScript } from './script-validation.js';
import {
  ACTION_TYPES, CONDITION_TYPES, TARGET_TYPES, FORBIDDEN_CONDITIONS,
  UNIT_FILTER_FIELDS, HAND_FILTER_FIELDS, DURATIONS, EVENTS,
} from '../shared/script-vocabulary.js';

const COMPARISONS = new Set(['>', '>=', '<', '<=', '==', '=', '!=', '!==']);

function targetType(spec) {
  if (typeof spec === 'string') return spec;
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) return spec.type || null;
  return null;
}

function checkTarget(spec, path, errors, warnings) {
  if (spec == null) return;
  if (typeof spec === 'string') {
    if (!TARGET_TYPES.has(spec)) errors.push(`${path} uses unknown target type "${spec}".`);
    return;
  }
  if (typeof spec !== 'object' || Array.isArray(spec)) {
    errors.push(`${path} must be a target string or object.`);
    return;
  }
  if (!spec.type) {
    errors.push(`${path}.type is required.`);
  } else if (!TARGET_TYPES.has(spec.type)) {
    errors.push(`${path} uses unknown target type "${spec.type}".`);
  }
  if (spec.count != null && (!Number.isInteger(spec.count) || spec.count < 1 || spec.count > 20)) {
    errors.push(`${path}.count must be an integer from 1 to 20.`);
  }
  if (spec.filter != null) {
    if (typeof spec.filter !== 'object' || Array.isArray(spec.filter)) {
      errors.push(`${path}.filter must be an object.`);
    } else {
      const allowed = spec.type === 'handCard' ? HAND_FILTER_FIELDS : UNIT_FILTER_FIELDS;
      for (const key of Object.keys(spec.filter)) {
        if (!allowed.has(key)) warnings.push(`${path}.filter.${key} is not implemented by the engine and will be ignored.`);
      }
      for (const key of ['minPower', 'maxPower', 'minHealth', 'maxHealth', 'minCost', 'maxCost']) {
        if (spec.filter[key] != null && !Number.isFinite(Number(spec.filter[key]))) {
          errors.push(`${path}.filter.${key} must be numeric.`);
        }
      }
    }
  }
}

function checkCondition(condition, path, errors, warnings) {
  if (condition == null) {
    errors.push(`${path} is required.`);
    return;
  }
  if (typeof condition !== 'object' || Array.isArray(condition)) {
    errors.push(`${path} must be a condition object.`);
    return;
  }
  const type = condition.type;
  if (!type) {
    errors.push(`${path}.type is required.`);
    return;
  }
  if (FORBIDDEN_CONDITIONS.has(type)) {
    errors.push(`${path} uses the unsupported condition "${type}".`);
    return;
  }
  if (!CONDITION_TYPES.has(type)) {
    errors.push(`${path} uses unknown condition type "${type}".`);
    return;
  }
  if (type === 'not') checkCondition(condition.condition, `${path}.condition`, errors, warnings);
  if (type === 'and' || type === 'or') {
    if (!Array.isArray(condition.conditions) || !condition.conditions.length) {
      errors.push(`${path}.conditions must be a non-empty array.`);
    } else {
      condition.conditions.forEach((child, index) => checkCondition(child, `${path}.conditions[${index}]`, errors, warnings));
    }
  }
  if ((type === 'hasKeyword' || type === 'sourceKeyword') && !condition.keyword) {
    errors.push(`${path}.keyword is required.`);
  }
  if (type === 'topDeckRegion' && !condition.region) {
    errors.push(`${path}.region is required.`);
  }
  if (type === 'event' && condition.value == null) {
    errors.push(`${path}.value is required.`);
  }
  if (type === 'counter' && (!condition.counter || typeof condition.counter !== 'string')) {
    errors.push(`${path}.counter is required.`);
  }
  if (type === 'firstTimeThisGame' && condition.scope != null && !['controller', 'source'].includes(condition.scope)) {
    errors.push(`${path}.scope must be controller or source.`);
  }
  if ((type === 'behold' || type === 'eventCard') && (!condition.filter || typeof condition.filter !== 'object' || Array.isArray(condition.filter))) {
    errors.push(`${path}.filter must be an object for ${type}.`);
  }
  if (condition.op != null && !COMPARISONS.has(condition.op)) {
    errors.push(`${path}.op "${condition.op}" is not a supported comparison.`);
  }
  if (condition.filter != null) {
    if (typeof condition.filter !== 'object' || Array.isArray(condition.filter)) {
      errors.push(`${path}.filter must be an object.`);
    } else {
      for (const key of Object.keys(condition.filter)) {
        if (!UNIT_FILTER_FIELDS.has(key)) warnings.push(`${path}.filter.${key} is not implemented by the engine and will be ignored.`);
      }
    }
  }
}

function checkAction(action, path, errors, warnings) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    errors.push(`${path} must be an action object.`);
    return;
  }
  const type = action.type;
  if (!type) {
    errors.push(`${path}.type is required.`);
    return;
  }
  if (!ACTION_TYPES.has(type)) {
    errors.push(`${path} uses unknown action type "${type}".`);
    return;
  }
  checkTarget(action.target, `${path}.target`, errors, warnings);
  checkTarget(action.secondaryTarget, `${path}.secondaryTarget`, errors, warnings);
  checkTarget(action.handTarget, `${path}.handTarget`, errors, warnings);
  if (action.duration != null && !DURATIONS.has(action.duration)) {
    errors.push(`${path}.duration must be one of ${[...DURATIONS].join(', ')}.`);
  }
  if (action.filter != null && (typeof action.filter !== 'object' || Array.isArray(action.filter))) {
    errors.push(`${path}.filter must be an object.`);
  }

  const needsAmount = new Set([
    'damage', 'dealDamage', 'damageAll', 'damageNexus',
    'heal', 'healUnit', 'healNexus',
  ]);
  if (needsAmount.has(type) && action.amount == null && action.value == null) {
    errors.push(`${path} requires amount or value.`);
  }
  if (type === 'buff' || type === 'give' || type === 'debuff') {
    if (action.power == null && action.health == null && action.attack == null) {
      errors.push(`${path} requires at least one of power, health, or attack.`);
    }
  }
  if (type === 'grantKeyword' || type === 'removeKeyword') {
    if (!action.keyword) errors.push(`${path}.keyword is required.`);
  }
  if (type === 'summon' && !action.name && !action.cardName && !action.cardId) {
    errors.push(`${path} requires name, cardName, or cardId.`);
  }
  if (type === 'create' && !action.name && !action.cardName && !action.cardId && !action.filter) {
    errors.push(`${path} requires name, cardName, cardId, or filter.`);
  }
  if (type === 'transform' && !action.cardId) {
    errors.push(`${path}.cardId is required.`);
  }
  if ((type === 'strike' || type === 'fight' || type === 'copy') && !action.target) {
    errors.push(`${path}.target is required.`);
  }
  if (type === 'addCounter' && (!action.counter || typeof action.counter !== 'string')) {
    errors.push(`${path}.counter is required.`);
  }
  if (type === 'addCounter' && action.amount != null && !Number.isFinite(Number(action.amount))) {
    errors.push(`${path}.amount must be numeric.`);
  }
  if (type === 'nextSummon') {
    const hasKeywords = Array.isArray(action.keywords) && action.keywords.length;
    const hasStats = Number(action.power) || Number(action.health);
    if (!hasKeywords && !hasStats) errors.push(`${path} requires keywords or power/health.`);
    if (action.keywords != null && !Array.isArray(action.keywords)) errors.push(`${path}.keywords must be an array.`);
  }
  if (type === 'pickFromTop') {
    if (action.count != null && (!Number.isInteger(action.count) || action.count < 1 || action.count > 20)) {
      errors.push(`${path}.count must be an integer from 1 to 20.`);
    }
    if (action.filter != null) {
      if (typeof action.filter !== 'object' || Array.isArray(action.filter)) {
        errors.push(`${path}.filter must be an object.`);
      } else {
        for (const key of Object.keys(action.filter)) {
          if (!HAND_FILTER_FIELDS.has(key)) warnings.push(`${path}.filter.${key} is not implemented by pickFromTop and will be ignored.`);
        }
      }
    }
  }
  if (type === 'equipFromHand' && (!action.target || !action.handTarget)) {
    errors.push(`${path} requires target and handTarget.`);
  }
  if (type === 'capture' && (!action.target || !action.secondaryTarget)) {
    errors.push(`${path} requires target (the captor) and secondaryTarget (the captured unit).`);
  }
  if (type === 'swap') {
    const count = typeof action.target === 'object' ? action.target?.count || 1 : 1;
    if (!action.target || count < 2) errors.push(`${path}.target must select at least 2 units.`);
  }
  if (type === 'strike' && action.striker != null && action.striker !== 'eventCard') {
    errors.push(`${path}.striker must be "eventCard" when set.`);
  }
  if (type === 'if') {
    checkCondition(action.condition, `${path}.condition`, errors, warnings);
    if (!Array.isArray(action.actions)) errors.push(`${path}.actions must be an array.`);
    else action.actions.forEach((child, index) => checkAction(child, `${path}.actions[${index}]`, errors, warnings));
    if (action.elseActions != null && !Array.isArray(action.elseActions)) errors.push(`${path}.elseActions must be an array.`);
    else if (Array.isArray(action.elseActions)) action.elseActions.forEach((child, index) => checkAction(child, `${path}.elseActions[${index}]`, errors, warnings));
  }
  if (type === 'random') {
    const branches = action.branches || action.actions;
    if (!Array.isArray(branches) || !branches.length) errors.push(`${path} requires a non-empty branches or actions array.`);
    else {
      branches.forEach((branch, index) => {
        if (Array.isArray(branch)) {
          branch.forEach((child, childIndex) => checkAction(child, `${path}.branches[${index}][${childIndex}]`, errors, warnings));
        } else if (branch && typeof branch === 'object') {
          if (!Array.isArray(branch.actions)) errors.push(`${path}.branches[${index}].actions must be an array.`);
          else branch.actions.forEach((child, childIndex) => checkAction(child, `${path}.branches[${index}].actions[${childIndex}]`, errors, warnings));
        } else {
          errors.push(`${path}.branches[${index}] must be an action array or object.`);
        }
      });
    }
  }
  if (type === 'repeat') {
    if (!Array.isArray(action.actions)) errors.push(`${path}.actions must be an array.`);
    else action.actions.forEach((child, index) => checkAction(child, `${path}.actions[${index}]`, errors, warnings));
  }
  if (type === 'choose') {
    if (!Array.isArray(action.options) || !action.options.length) {
      errors.push(`${path}.options must be a non-empty array.`);
    } else {
      const ids = new Set();
      action.options.forEach((option, index) => {
        const optionPath = `${path}.options[${index}]`;
        if (!option || typeof option !== 'object' || Array.isArray(option)) {
          errors.push(`${optionPath} must be an object.`);
          return;
        }
        if (typeof option.id !== 'string' || !option.id.trim()) errors.push(`${optionPath}.id must be a non-empty string.`);
        else if (ids.has(option.id)) errors.push(`${optionPath}.id must be unique.`);
        else ids.add(option.id);
        if (typeof option.label !== 'string' || !option.label.trim()) errors.push(`${optionPath}.label must be a non-empty string.`);
        if (!Array.isArray(option.actions) || !option.actions.length) errors.push(`${optionPath}.actions must be a non-empty array.`);
        else option.actions.forEach((child, childIndex) => checkAction(child, `${optionPath}.actions[${childIndex}]`, errors, warnings));
      });
    }
  }
  if (Array.isArray(action.actions) && type !== 'if' && type !== 'random' && type !== 'repeat' && type !== 'choose') {
    action.actions.forEach((child, index) => checkAction(child, `${path}.actions[${index}]`, errors, warnings));
  }
  if (Array.isArray(action.elseActions) && type !== 'if') {
    action.elseActions.forEach((child, index) => checkAction(child, `${path}.elseActions[${index}]`, errors, warnings));
  }
  if (Array.isArray(action.then)) {
    action.then.forEach((child, index) => checkAction(child, `${path}.then[${index}]`, errors, warnings));
  }
}

function stableValue(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function lintScript(script, { strict = false, card = null, status = null } = {}) {
  const shape = validateScript(script);
  const errors = [...shape.errors];
  const warnings = [...shape.warnings];
  if (!script || typeof script !== 'object' || Array.isArray(script)) {
    return { ok: false, errors, warnings, shape };
  }

  if (script.condition != null) {
    warnings.push('script.condition is ignored by the engine; put the condition on each trigger instead.');
  }
  if (Array.isArray(script.triggers) && script.triggers.length === 0 && !script.levelUp) {
    warnings.push('Script has no triggers or levelUp condition.');
  }
  if (script.levelUp != null) {
    if (typeof script.levelUp !== 'object' || Array.isArray(script.levelUp)) {
      errors.push('script.levelUp must be an object.');
    } else {
      checkCondition(script.levelUp.condition, 'script.levelUp.condition', errors, warnings);
    }
  }
  if (status === 'curated' && card?.supertype === 'Champion' && (card.level2Id || String(card.levelup || '').trim()) && !script.levelUp?.condition) {
    errors.push('Curated champion scripts must declare script.levelUp.condition (use { "type": "always" } only when the printed text levels unconditionally).');
  }

  const seen = new Map();
  for (const [index, trigger] of (Array.isArray(script.triggers) ? script.triggers : []).entries()) {
    const path = `triggers[${index}]`;
    if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) continue;
    if (!trigger.on) errors.push(`${path}.on is required.`);
    if (trigger.continueOnSourceDeath != null && typeof trigger.continueOnSourceDeath !== 'boolean') {
      errors.push(`${path}.continueOnSourceDeath must be a boolean.`);
    }
    if (trigger.condition != null) checkCondition(trigger.condition, `${path}.condition`, errors, warnings);
    if (Array.isArray(trigger.actions)) {
      if (!trigger.actions.length) errors.push(`${path}.actions must not be empty.`);
      trigger.actions.forEach((action, actionIndex) => checkAction(action, `${path}.actions[${actionIndex}]`, errors, warnings));
    }
    if (trigger.on) {
      const key = `${trigger.on}|${stableValue(trigger.condition || null)}|${stableValue(trigger.actions || [])}`;
      if (seen.has(key)) {
        warnings.push(`${path} duplicates ${seen.get(key)} (same event, condition, and actions).`);
      } else {
        seen.set(key, path);
      }
    }
  }
  const triggerNames = new Set((Array.isArray(script.triggers) ? script.triggers : []).map((trigger) => trigger?.on));
  if (triggerNames.has(EVENTS.CAST_SPELL) && triggerNames.has(EVENTS.SPELL_CAST)) {
    warnings.push(`Script uses both "${EVENTS.CAST_SPELL}" and "${EVENTS.SPELL_CAST}"; they dispatch as one alias and would fire twice.`);
  }

  const ok = errors.length === 0 && (!strict || warnings.length === 0);
  return { ok, errors, warnings, shape };
}

export function lintScripts(scripts, options = {}) {
  const errors = [];
  const warnings = [];
  for (const [id, entry] of Object.entries(scripts || {})) {
    const script = entry?.script ?? entry;
    if (!script) continue;
    const result = lintScript(script, {
      ...options,
      card: options.cardsById?.get(id) || null,
      status: entry?.status || null,
    });
    errors.push(...result.errors.map((error) => `${id}: ${error}`));
    warnings.push(...result.warnings.map((warning) => `${id}: ${warning}`));
  }
  return { ok: errors.length === 0 && (!options.strict || warnings.length === 0), errors, warnings };
}

export { targetType };
