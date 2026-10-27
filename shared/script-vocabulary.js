// Single source of truth for the declarative effect DSL vocabulary.
// The engine, validator, manifest, lint, coverage report, and tests all read
// from this module. Keep it pure: no Node-only imports, because the browser
// also compares manifests.
//
// A vocabulary entry is only listed here when the engine actually implements
// it. Reserved-but-unimplemented names must not be added until their dispatch
// or execution site exists.

export const EVENTS = Object.freeze({
  PLAY: 'play',
  PLAY_CARD: 'playCard',
  SUMMON: 'summon',
  ATTACK: 'attack',
  ALLY_ATTACK: 'allyAttack',
  BLOCK: 'block',
  STRIKE: 'strike',
  NEXUS_STRIKE: 'nexusStrike',
  DEATH: 'death',
  ALLY_DEATH: 'allyDeath',
  ENEMY_DEATH: 'enemyDeath',
  SUMMON_OTHER: 'summonOther',
  ENEMY_SUMMON: 'enemySummon',
  ROUND_START: 'roundStart',
  ROUND_END: 'roundEnd',
  SURVIVE_DAMAGE: 'surviveDamage',
  DAMAGE_UNIT: 'damageUnit',
  DAMAGE_NEXUS: 'damageNexus',
  HEAL: 'heal',
  DISCARD: 'discard',
  TARGETED: 'targeted',
  SPELL_CAST: 'spellCast',
  // Legacy alias for SPELL_CAST. Both names are accepted and dispatch to the
  // same watcher event.
  CAST_SPELL: 'castSpell',
  ENEMY_SPELL: 'enemySpell',
  EQUIP: 'equip',
  DETACH: 'detach',
  SUPPORT: 'support',
  SUPPORTED: 'supported',
  LURK: 'lurk',
  COUNTDOWN: 'countdown',
  RECALL: 'recall',
  BARRIER: 'barrier',
  LEVEL_UP: 'levelUp',
  TRANSFORM: 'transform',
  AURA: 'aura',
});

export const TRIGGER_NAMES = Object.freeze(Object.values(EVENTS));
export const KNOWN_TRIGGERS = new Set(TRIGGER_NAMES);

// Control flow is executed by EffectRunner.pump, not by execute().
export const CONTROL_FLOW_ACTIONS = new Set(['if', 'random', 'repeat', 'choose']);

// Every action type accepted by EffectRunner, including aliases and control
// flow. `then` is a field on an action, not an action type.
export const ACTION_TYPES = new Set([
  'damage', 'dealDamage', 'damageAll', 'damageNexus',
  'heal', 'healUnit', 'healNexus',
  'buff', 'give', 'debuff',
  'grantKeyword', 'removeKeyword', 'barrier', 'spellShield',
  'stun', 'frostbite', 'recall', 'silence', 'kill', 'obliterate',
  'draw', 'discard', 'summon', 'create', 'createRandom',
  'mana', 'spellMana', 'emptyManaGem', 'rally',
  'strike', 'fight', 'levelUp', 'transform', 'copy',
  'toss', 'predict', 'counter', 'shuffle', 'addToHandFromDeck',
  'destroyEquipment', 'detach', 'moveToDeck',
  'log', 'noop',
  ...CONTROL_FLOW_ACTIONS,
]);

// Choice targets prompt a player. Automatic targets resolve without a prompt.
export const CHOICE_TARGETS = new Set([
  'allyUnit', 'otherAllyUnit', 'enemyUnit', 'anyUnit',
  'anyNexus', 'anyTarget', 'allyTarget',
  'allyChampion', 'enemyChampion', 'allyFollower', 'enemyFollower',
  'allyLandmark', 'enemyLandmark', 'handCard',
]);

export const AUTO_TARGETS = new Set([
  'none', 'self',
  'allyNexus', 'enemyNexus',
  'attacker', 'blocker', 'strikeTarget',
  'supporter', 'supported',
  'strongestAlly', 'weakestAlly', 'strongestEnemy', 'weakestEnemy',
  'randomAllyUnit', 'randomOtherAllyUnit', 'randomEnemyUnit', 'randomUnit',
  'allAllyUnits', 'allOtherAllyUnits', 'allEnemyUnits', 'allOtherEnemyUnits',
  'allUnits', 'allBattlingUnits', 'allAttackingUnits', 'allDefendingUnits',
  'allDamagedAllyUnits', 'allDamagedEnemyUnits',
  'allChampionAllies', 'allChampionEnemies',
]);

export const TARGET_TYPES = new Set([...CHOICE_TARGETS, ...AUTO_TARGETS]);

// Conditions implemented by evalCondition. `custom` is deliberately absent:
// it used to return true unconditionally and is rejected by semantic lint.
export const CONDITION_TYPES = new Set([
  'always', 'not', 'and', 'or',
  'allyCount', 'enemyCount', 'boardCount',
  'selfPower', 'selfHealth', 'selfMaxHealth', 'selfCost',
  'hasKeyword', 'sourceKeyword', 'sourceDamaged',
  'mana', 'spellMana', 'handCount', 'enemyHandCount', 'deckCount',
  'nexusHealth', 'allyDiedThisRound', 'unitsDiedThisRound',
  'spellsPlayedThisRound', 'spellsPlayedThisGame', 'manaSpentOnSpellsThisGame',
  'stunnedOrRecalled', 'enlightened', 'deep', 'topDeckRegion',
  'plunder', 'daybreak', 'nightfall', 'round',
  'sourceAttacking', 'sourceBlocking', 'sourceLeveled', 'targetChampion',
  'event', 'eventCard', 'firstTimeThisRound', 'firstTimeThisGame',
  'cardsPlayedThisRound', 'cardsDrawnThisRound', 'cardsDrawnInARoundThisGame',
  'damageTakenThisRound', 'damageDealtThisRound', 'equipsThisGame',
  'sourceEquipped', 'attackerEquipped', 'behold', 'healWasDamaged',
  'reputation', 'allegiance', 'lurkActive', 'fated',
  'flow', 'evolve', 'augment', 'hallowed', 'brash', 'formidable',
]);

// Conditions that remain accepted by the engine for legacy scripts but must
// never appear in a shipped seed script.
export const FORBIDDEN_CONDITIONS = new Set(['custom']);

export const SCRIPT_STATUSES = new Set(['none', 'manual', 'auto', 'partial', 'curated', 'custom']);

// Filter fields understood by matchesFilter (unit targets) and the smaller
// handCard path in targetOptions.
export const UNIT_FILTER_FIELDS = new Set([
  'type', 'keyword', 'notKeyword', 'minPower', 'maxPower', 'minHealth', 'maxHealth',
  'minCost', 'maxCost', 'damaged', 'region', 'subtype', 'supertype', 'excludeSource', 'excludeUid',
  'champion',
]);

export const HAND_FILTER_FIELDS = new Set(['maxCost', 'minCost', 'type']);

export const DURATIONS = new Set(['permanent', 'round']);

export const VERIFICATION_VERSION = 1;
