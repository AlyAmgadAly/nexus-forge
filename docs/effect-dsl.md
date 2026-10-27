# Effect DSL reference

Last verified: **2026-10-27** against `shared/script-vocabulary.js`,
`server/engine/effects.js`, and `server/engine/game.js`.

This document describes the declarative JSON effect language used by Nexus
Forge. It is a reference for authoring card scripts, not a promise that every
Riot card is already scripted. Coverage and verification are reported
separately; see [Reporting](#reporting-and-status).

Scripts are **data, never code**. The engine does not evaluate JavaScript from a
script, and the DSL has no `eval`, `Function`, `import`, or `require` escape
hatch. Unknown vocabulary is rejected by semantic lint and is never allowed to
silently broaden an effect.

## Script envelope

A script file is an object keyed by card ID:

```json
{
  "01DE001": {
    "status": "auto",
    "script": {
      "triggers": [
        {
          "on": "play",
          "actions": [
            { "type": "draw", "amount": 1 }
          ]
        }
      ]
    },
    "seed": { "version": "0.3.0", "origin": "seed" }
  }
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `status` | Yes | `auto`, `partial`, or `curated` in seed data. `custom` is local-only. `none`/`manual` are derived and should not carry a script. |
| `script` | Yes | `{ "triggers": [...], "levelUp": {...} }`. |
| `verification` | For `curated` | Test name, normalized card-text hash, clauses, reviewer, and timestamp. |
| `seed` | Written by upgrades | Seed version, origin, and the baseline script hash. Do not hand-edit. |
| `updatedAt` | Written by tooling | ISO timestamp used only for local-modification detection. |

### Status taxonomy

| Status | Meaning | Counts as present? | Counts as verified? |
| --- | --- | --- | --- |
| `none` | Collectible card with no rules text | No | No |
| `manual` | Text card with no script | No | No |
| `auto` | Machine-generated, not semantically verified | Yes | No |
| `partial` | Covers some clauses only | Yes | No |
| `curated` | Hand-authored, tested, and verified | Yes | Yes |
| `custom` | Local user script; never shipped or verified | Yes, locally | No |

`none` and `manual` are derived from card text and script presence. Do not
write them as script entries to make a report look better. A `curated` entry
without valid verification is downgraded to `partial` by the store and by
reports.

### Verification metadata

```json
{
  "verification": {
    "version": 1,
    "cardTextHash": "sha256-of-normalized-card-text",
    "verifiedAt": "2026-10-27T00:00:00.000Z",
    "verifiedBy": "agent",
    "test": "test/engine.test.mjs#brightsteel-formation",
    "clauses": [
      "When I'm summoned: give allies Barrier this round.",
      "Attack: give allies Barrier this round."
    ],
    "notes": ""
  }
}
```

The test path must be relative, start with `test/`, and name an existing test
case after `#`. `scripts/lint-scripts.mjs` checks this for seed entries. A
card-text hash mismatch means the printed text changed; re-review the script
and update the hash.

## Script shape

```json
{
  "triggers": [
    {
      "on": "play",
      "condition": { "type": "always" },
      "actions": [
        { "type": "draw", "amount": 1 }
      ]
    }
  ],
  "levelUp": {
    "condition": { "type": "allyDiedThisRound" }
  }
}
```

- `triggers` is an array. Every trigger must have an implemented `on` value and
  a non-empty `actions` array.
- `condition` is optional. If present and false, the trigger's actions are
  skipped; the card is still played or summoned.
- `continueOnSourceDeath` is an optional boolean. Set it only when the
  remaining actions do not depend on the source staying in play, such as a
  watcher that must finish a separate effect after its source is struck.
- `deferTargets` is an optional boolean. When true, no targets are collected
  before the card is played; each action prompts during resolution instead.
  Use it for modal cards where the chosen branch determines the target, such
  as Catch!. Without it, the play UI asks for every branch's targets up front.
- `levelUp.condition` is read by `checkLevelUps()` for champions with a
  `level2Id`. It is not a trigger. The `levelUp` trigger fires after the swap.
- Trigger-level `"auto": true|false` is legacy metadata. `Game.runScript()`
  does **not** read it. Whether a target prompts is decided by the target type
  and whether the resolution is automatic.

## Triggers and dispatch timing

| Trigger | Fires when | Notes |
| --- | --- | --- |
| `play` | A card is played from hand | Spells, units, equipment, and champion duplicates. A unit played from hand also fires `summon`. |
| `playCard` | A non-spell card is played | Watcher trigger. Fires for units, landmarks, and equipment, but not spells. |
| `summon` | A unit is summoned | Hand plays, token summons, and revives. |
| `summonOther` | Another friendly unit is summoned | Watcher trigger on the other unit. |
| `enemySummon` | An enemy unit is summoned | Watcher trigger on the enemy unit. |
| `attack` | A unit is declared as an attacker | Fires on the attacker itself. |
| `allyAttack` | Another friendly unit is declared as an attacker | Watcher trigger on other allies. |
| `support` | A Support attacker is linked to a supported attacker | Dispatched to the supporter; use `target: supported`. |
| `supported` | A unit is supported by a Support attacker | Dispatched to the supported unit; use `target: supporter`. |
| `lurk` | An attacking team has at least one Lurker | Dispatched to allied units with a `lurk` trigger. |
| `targeted` | A spell action targets a unit | Target history is recorded before the action resolves. |
| `block` | An attacker/blocker pair is declared | Dispatched to the attacker and the blocker. |
| `strike` | A unit strikes a unit | After combat or effect strike. |
| `nexusStrike` | A unit strikes a Nexus | After the Nexus damage. |
| `surviveDamage` | A unit survives damage | The source is the damaged unit. |
| `damageUnit` | A unit takes damage | Fires before death watchers; fields include `amount`, `eventSource`, `lethal`, and the damage flags. |
| `damageNexus` | A Nexus takes damage | Fields include `nexus`, `amount`, and `eventSource`. |
| `heal` | A unit or Nexus is healed | Fields include `healed` or `nexus`, `amount`, and `eventSource`. |
| `death` | The unit dies | The dying unit's own Last Breath. |
| `allyDeath` | A friendly unit dies | Watcher trigger on other friendly units. |
| `enemyDeath` | An enemy unit dies | Watcher trigger on enemy units. |
| `roundStart` | Round begins | Before the draw, after auras are recalculated. |
| `roundEnd` | Round ends | Before Ephemeral, Regeneration, and spell-mana handling. |
| `spellCast` | A friendly spell is cast | Canonical spell-cast event. |
| `castSpell` | A friendly spell is cast | Legacy alias of `spellCast`; both names dispatch as one event. |
| `enemySpell` | An enemy spell is cast | Watcher trigger. |
| `discard` | A card is discarded | The discarded card's own script and on-board watchers can trigger; fields include `card`, `player`, `random`, `reason`, and `eventSource`. |
| `equip` | Equipment is attached to a unit | Fields include `equipped`, `equipment`, and `player`. |
| `detach` | Equipment is removed from a unit | Fields include `equipped`, `equipment`, `cards`, and `reason`. |
| `countdown` | A landmark countdown advances | Fields include `landmark`, `countdown`, and `destroyed`. |
| `recall` | A unit is returned to hand | Dispatched to the recalled unit and allied watchers. Fields include `recalled`, `player`, and `source`. |
| `barrier` | A unit gains Barrier | Dispatched to the unit and allied watchers after the status is applied. Fields include `unit` and `source`. |
| `levelUp` | A champion levels up | After the level-2 card and script swap. |
| `transform` | A unit transforms | After `transformUnit()` swaps the card and script. |
| `aura` | Auras are recalculated | Special path; see [Auras](#auras). |

`allySummon` is **not** a trigger. Use `summonOther`. Unknown triggers are a
warning for custom scripts and an error in strict seed lint.

### Event context fields

Every trigger resolution keeps `source` as the unit whose script is resolving,
so `self` targets continue to work for watchers. The cause of a damage, heal,
or discard event is exposed separately as `eventSource`. Event-specific fields
are merged into the condition/action context:

| Event | Fields |
| --- | --- |
| `damageUnit` | `damaged`, `amount`, `eventSource`, `lethal`, `combat`, `spell`, `skill` |
| `damageNexus` | `nexus`, `amount`, `eventSource`, `combat`, `spell`, `skill` |
| `heal` | `healed` or `nexus`, `amount`, `eventSource`, `healer` |
| `discard` | `card`, `player`, `random`, `reason`, `eventSource` |
| `playCard` | `card`, `played`, `player`, optional `equipped` or `leveled` |
| `spellCast` / `castSpell` | `spell`, `caster` |
| `equip` | `equipped`, `equipment`, `player` |
| `detach` | `equipped`, `equipment`, `cards`, `reason` |
| `block` | `attacker`, `blocker`, `target`, `combat` |
| `support` / `supported` | `supporter`, `supported`, `combat` |
| `lurk` | `attackers`, `lurkers`, `combat` |
| `targeted` | `target`, `source`, `action`, `spell`, `skill` |
| `countdown` | `landmark`, `countdown`, `destroyed` |
| `recall` | `recalled`, `player`, `source` |
| `barrier` | `unit`, `source` |

`behold`, `reputation`, `flow`, `allegiance`, `fated`, `evolve`, `augment`,
`hallowed`, `brash`, and `formidable` are conditions, not trigger events. Do not
use them as `on` values.

### `play` versus `summon`

A unit played from hand fires both `play` and `summon`. A token or revived unit
fires only `summon`. Use the event that matches the printed wording:

- "When I'm summoned" -> `summon`.
- "When I'm played" / "Play:" -> `play`.
- "When you summon another unit" -> `summonOther` on the watcher.

### Support and Lurk

When a Support attacker is declared, the engine links it to another attacker or
to itself. `support` resolves on the supporter and `supported` resolves on the
linked unit. Use `target: supported` from the supporter and
`target: supporter` from the supported unit. A caller can pass an explicit
`supports` map keyed by the supporter's UID; without one, the link is automatic.

If the attacking team has a Lurker, `lurkActiveThisRound` is set and `lurk`
dispatches to allied units that declare a `lurk` trigger. `lurkActive` reads the
team flag.

### Equipment

Playing an Equipment card attaches an entry to the target ally. Its attack,
health, and canonical keywords are read by `power`, `maxHealth`, `hasKeyword`,
and keyword-stack checks, so removing the attachment removes the bonuses.
`detach` returns the equipment card to hand; `destroyEquipment` discards it.
When a unit dies, its attached equipment currently returns to hand.

### Death watchers

`death` is the dying unit's own trigger. `allyDeath` and `enemyDeath` are
watchers on other units. Do not add both unless the printed text says both.

When several units die together, `damageAll`, multi-target `damage`/`kill`, and
combat exchanges queue the deaths before resolving any Last Breath effect. The
dying unit's own `death` trigger resolves before watchers from the same seat.

### Trigger queue and resolution order

Every trigger dispatch goes through `Game.emitEvents()` and one FIFO event
queue. `Game.runScript()` is the single-trigger convenience wrapper. The queue
is drained by `EffectRunner.pump()` after the current resolution stack is empty.
Nested control-flow actions (`if`, `random`, `choose`, `repeat`, `then`) still
use the LIFO resolution stack; they do not create a second event path.

When a batch contains several simultaneous triggers, they are sorted by:

1. Active team first.
2. Seat order within that team, from the player order used to create the game.
3. Semantic phase (for deaths, the dying unit's own trigger before watchers).
4. Board position, then unit creation order.
5. Emission order as the final stable tie-breaker.

The queue logs a line such as
`Event order (Team A active first, then seat): ...` whenever a batch has more
than one trigger. Multiple triggers on the same script resolve in the order they
are declared in the `triggers` array.

Nested events emitted while a trigger is resolving are appended to the FIFO
queue and resolve after the current resolution stack empties. A queued trigger
still resolves if its source leaves play before the trigger starts. If the
source dies during its own trigger, the engine stops that trigger's remaining
actions and logs
`<name> died during its <event> trigger; remaining actions skipped.` A trigger
may opt out with `"continueOnSourceDeath": true` when its later actions do not
need the source. Death triggers are exempt because their source is already dead
by design. `aura` is
also exempt from the queue because it is a continuous recalculation path, not a
triggered event.

### Event storm guard

A single top-level pump may dispatch at most 500 event batches by default
(`settings.events.maxPerPump` overrides it). If a chain exceeds that budget, the
engine logs `Event storm guard: dropped ...` and clears the remaining queue. The
event queue is also capped at 500 batches by default
(`settings.events.maxQueue`). These limits are safety rails, not game rules; a
script that reaches them is a bug.

### `daybreak` and `nightfall`

These are conditions, not triggers. Model "Daybreak: ..." as a `play` or
`summon` trigger with `condition: { "type": "daybreak" }`. Use `nightfall` the
same way. Do not use them as `on` values.

## Actions

Every action is an object with a `type`. Common fields:

| Field | Meaning |
| --- | --- |
| `target` | Target name or `{ "type": ..., "count": ..., "filter": ..., "prompt": ... }`. |
| `secondaryTarget` | Second chosen entity, resolved after `target`. Used by `capture` for the captured unit. |
| `handTarget` | Chosen card in the controller's hand. Used by `equipFromHand`. |
| `amount` / `value` | Numeric or symbolic amount. See [Amounts](#amounts). |
| `duration` | `permanent` (default) or `round`. |
| `condition` | Condition object for `if`; for other actions, prefer a trigger condition. |
| `then` | Array of actions to run after this action. |
| `prompt` | Custom choice prompt text. |

### Damage, healing, and stats

| Action | Fields | Behavior |
| --- | --- | --- |
| `damage` / `dealDamage` | `amount`/`value`, `target` | Deals damage to each resolved target. Unit or Nexus. Lifesteal on the source heals its Nexus. |
| `damageAll` | `amount`, `team` (`ally` default or `enemy`), `filter`, `includeNexus` | Damages every matching unit on **one** team. `includeNexus` also hits that team's Nexus. |
| `damageNexus` | `amount`, `who` (`ally` or `enemy`, default `enemy`) | Damages one Nexus. |
| `heal` / `healUnit` | `amount`, `target` | Heals units or Nexuses. |
| `healNexus` | `amount`, `who` (`ally` default or `enemy`) | Heals one Nexus. |
| `buff` / `give` | `power`/`attack`, `health`, `duration`, `target` | Adds stats. Negative values are allowed by `buff`. A `handCard` target stores the buff on the hand entry; it applies when the card is played as a unit. |
| `debuff` | `power`, `health`, `duration`, `target` | Subtracts stats. |

### Keywords and statuses

| Action | Fields | Behavior |
| --- | --- | --- |
| `grantKeyword` | `keyword`, `duration`, `target` | Grants a canonical keyword. |
| `removeKeyword` | `keyword`, `target` | Removes a keyword. |
| `barrier` | `target` | Grants Barrier. |
| `spellShield` | `target` | Grants SpellShield. |
| `stun` | `target` | Stuns a unit. |
| `frostbite` | `target` | Sets a unit's power to 0 for the round. |
| `recall` | `target` | Returns a unit to hand, or obliterates it if hand is full. |
| `silence` | `target` | Silences a unit. |
| `detach` | `target` | Removes attached equipment and returns it to hand. |
| `destroyEquipment` | `target` | Removes attached equipment and puts it in the discard pile. |
| `kill` | `target` | Kills a unit. |
| `obliterate` | `target` | Removes a unit without a death trigger. |

### Cards, mana, and combat

| Action | Fields | Behavior |
| --- | --- | --- |
| `draw` | `amount`, `who` (`ally` default, `opponent`, `all`), `fleeting` | Draws cards. Hand-limit burn applies. |
| `discard` | `amount`, `who` (`ally` default or `opponent`), `random` (default `true`) | Random discard by default. `random: false` discards the first card. |
| `summon` | `name`/`cardName`/`cardId`, `count` | Summons a token from the card database. By-name lookup picks the first matching token. |
| `create` | `name`/`cardName`/`cardId` or `filter`, `count`, `destination` (`hand` default or `deck`), `fleeting` | Creates a card. If no named card is found and a filter is present, uses a random matching card. |
| `createRandom` | `filter`, `count`, `destination`, `fleeting` | Creates random cards matching the filter. |
| `mana` | `amount` | Adds mana this round. |
| `spellMana` | `amount` | Adds spell mana. |
| `emptyManaGem` | none | Adds an empty mana gem. |
| `rally` | none | Rallies the controller's team. |
| `strike` | `target`, optional `striker` | The source strikes the target. `striker: "eventCard"` makes the event's played/summoned card strike instead. |
| `fight` | `target` | Source and target strike each other. |
| `levelUp` | none | Calls `game.levelUp(source)` unconditionally. Prefer `script.levelUp.condition`. |
| `transform` | `cardId` | Transforms the source into the named card and fires `transform`. |
| `copy` | `target` | Summons a copy of a unit. Cannot copy spells, landmarks, or equipment. |
| `moveToDeck` | `target`, `position` (`top`, `bottom`, or `shuffle` default) | Removes a unit from play and puts its card into its owner's deck. Attached equipment returns to hand. |
| `equipFromHand` | `target` (bearer), `handTarget` (equipment) | Attaches an equipment card from hand to an allied unit without paying its cost. Skips if no legal pair exists. |
| `pickFromTop` | `count` (default 4), `filter`, `rest` (`shuffle` default) | Reveals the top `count` cards, lets the controller pick one matching `filter`, draws it, then shuffles the rest back (or keeps them on top when `rest: "keep"`). |
| `capture` | `target` (captor), `secondaryTarget` (captured unit) | Removes the captured unit from play under the captor. It is released to its owner's board when the captor leaves play. |
| `swap` | `target` with `count: 2` | Swaps the board positions of two allied units. |
| `nextSummon` | `keywords`, `power`, `health` | Buffs the controller's next summoned ally this round. Unused buffs expire at round end. |
| `addCounter` | `counter`, `amount` (default 1), optional `target` | Increments a named counter on the source or targets. |
| `toss` | `amount` | Tosses cards from the bottom of the deck. |
| `predict` | `count` (default 3) | Automatically takes the highest-cost card from the top N. Not a player choice. |
| `counter` | none | Counters the top stack item. |
| `shuffle` | none | Shuffles the controller's deck. |
| `addToHandFromDeck` | none | Adds a random card from the deck to hand. |
| `log` | `text` | Writes an effect log entry. |
| `noop` | none | Does nothing. |

### Control flow

Control-flow actions are executed by `EffectRunner.pump()`, not by
`EffectRunner.execute()`.

| Action | Fields | Behavior |
| --- | --- | --- |
| `if` | `condition`, `actions`, `elseActions` | Runs one branch. Nested actions are queued on the resolution stack. |
| `random` | `branches` or `actions` | Chooses one branch uniformly with the game RNG. A branch is an action array or `{ "actions": [...] }`. |
| `choose` | `options`, optional `prompt` | Prompts the controller to choose one option. Each option is `{ "id", "label", "actions" }`. Automatic triggers choose the first option. |
| `repeat` | `amount`/`value`/`count`, `actions` | Runs the actions up to 10 times. |
| `then` | field on any action | Queues the `then` array after the action completes. |

`then` is a field, not an action type. It is useful when a later action must see
the result of the current action, for example damage followed by a conditional
buff.

### Amounts

`amount` and `value` accept:

- A number.
- A string: `selfPower`, `selfHealth`, `selfMaxHealth`, `targetHealth`,
  `targetMaxHealth`, `targetPower`, `mana`, `spellMana`, `handCount`,
  `enemyHandCount`, `deckCount`, `damageTaken`, `round`.
- An object: `{ "type": "sourcePower" }`, `{ "type": "targetHealth" }`, or
  `{ "type": "fixed", "value": 2 }`.

An unknown string becomes `Number(value) || 0`; an unknown object becomes `0`.
Semantic lint does not currently validate every amount string, so prefer the
documented forms.

### Durations

Only `permanent` and `round` are supported. `permanent` is the default for
`buff`, `debuff`, and `grantKeyword`. A round buff is cleared by the engine's
round cleanup. Do not invent `game`, `aura`, or `untilEndOfTurn` values.

## Targets

`target` accepts a string or an object:

```json
{ "type": "enemyUnit", "count": 1, "filter": { "maxHealth": 2 } }
```

### Choice targets

Choice targets prompt the controller when the resolution is not automatic:

`allyUnit`, `otherAllyUnit`, `enemyUnit`, `anyUnit`, `anyNexus`, `anyTarget`,
`allyTarget`, `allyChampion`, `enemyChampion`, `allyFollower`, `enemyFollower`,
`allyLandmark`, `enemyLandmark`, `handCard`.

During automatic triggers, the engine picks random legal options instead of
prompting. If there are no legal options, the action is skipped and an effect
log entry is written; the game does not stall.

`count` is exact for choice targets: it becomes both the minimum and maximum
number of picks. If fewer legal options exist than `count`, the prompt cannot
be completed. Use `count: 1` unless the printed text explicitly asks for
multiple targets and the board can supply them.

### Automatic targets

`none`, `self`, `allyNexus`, `enemyNexus`, `attacker`, `blocker`,
`strikeTarget`, `supporter`, `supported`, `strongestAlly`, `weakestAlly`,
`strongestEnemy`, `weakestEnemy`, `randomAllyUnit`, `randomOtherAllyUnit`,
`randomEnemyUnit`, `randomUnit`, `allAllyUnits`, `allOtherAllyUnits`,
`allEnemyUnits`, `allOtherEnemyUnits`, `allUnits`, `allBattlingUnits`,
`allAttackingUnits`, `allDefendingUnits`, `allDamagedAllyUnits`,
`allDamagedEnemyUnits`, `allChampionAllies`, `allChampionEnemies`,
`lastTargets`, `lastRecalled`, `eventUnit`.

`all*` targets return every matching entity. `count` is ignored for `all*`
targets. Use a choice target for "one" and an all-target for "all".

`anyNexus` during automatic resolution picks the enemy Nexus. `anyTarget`
during automatic resolution picks a random legal unit or Nexus. `allyTarget`
picks a random legal ally unit or your Nexus.

Unknown target types return no options and write an error to the game log.
They never fall back to "all units." Semantic lint rejects them before play.

### Filters

Unit target filters:

| Field | Meaning |
| --- | --- |
| `type` | `champion`, `follower`, `landmark`, `unit`, or `equipment`. |
| `keyword` / `notKeyword` | Canonical keyword present/absent. |
| `minPower` / `maxPower` | Current power bounds. |
| `minHealth` / `maxHealth` | Current health bounds. |
| `minCost` / `maxCost` | Card cost bounds. |
| `damaged` | `true` = damaged, `false` = undamaged. |
| `region` | Region code, for example `Demacia`. |
| `subtype` | Exact subtype. |
| `supertype` | Exact supertype, for example `Champion`. |
| `excludeSource` | `true` or `"self"` excludes the source unit. |
| `excludeUid` | Excludes a specific unit UID. |
| `champion` | `true`/`false` champion shorthand. |
| `equipped` | `true`/`false` attached-equipment shorthand. |
| `types` | Array of type checks; matches any entry. |
| `excludeChosen` | Excludes entities already chosen by the current action (multi-target prompts). |

`handCard` supports `maxCost`, `minCost`, `type`, `types`, `keyword`,
`notKeyword`, `region`, `subtype`, and `supertype`. Action filters for
`create` and `createRandom` use the card-pool filter path in
`Game.randomCard()`; supported fields include `region`, `regions`, `type`,
`supertype`, `keyword`, `maxCost`, `minCost`, `excludeRegion` (a single region
code), and `excludeRegions` (an array of region codes).
`addToHandFromDeck` takes no filter and always picks a random card.

## Conditions

A condition is evaluated before a trigger's actions. `op` accepts `>`, `>=`,
`<`, `<=`, `==`, `=`, and `!=`; the default is `>=`.

| Condition | Fields | Semantics |
| --- | --- | --- |
| `always` | none | True. |
| `not` | `condition` | Negates a condition. |
| `and` / `or` | `conditions` | All / any child conditions. |
| `allyCount` / `enemyCount` | `filter`, `op`, `value` | Counts matching units on that team. |
| `boardCount` | `op`, `value` | Counts friendly board units. |
| `selfPower` / `selfHealth` / `selfMaxHealth` / `selfCost` | `op`, `value` | Source stats. |
| `hasKeyword` | `keyword`, `target` (`source` default or `enemy`) | Keyword check. `enemy` checks the first enemy unit only. |
| `sourceKeyword` | `keyword` | Source keyword check. |
| `sourceDamaged` | `value` | `value: false` means undamaged; otherwise damaged. |
| `mana` | `op`, `value` | Friendly maximum mana. |
| `spellMana` | `op`, `value` | Friendly spell mana. |
| `handCount` / `deckCount` | `op`, `value` | Controller hand/deck size. |
| `enemyHandCount` | `op`, `value` | Largest enemy-team hand. |
| `nexusHealth` | `who` (`ally` default or `enemy`), `op`, `value` | Nexus health. |
| `allyDiedThisRound` / `unitsDiedThisRound` | none | Any friendly / any unit died this round. |
| `spellsPlayedThisRound` | `op`, `value` | Friendly spells this round. |
| `spellsPlayedThisGame` | `op`, `value` | Controller spells this game. |
| `manaSpentOnSpellsThisGame` | `op`, `value` | Controller spell mana spent this game. |
| `stunnedOrRecalled` | `op`, `value` | Controller's stunned-or-recalled count. |
| `enlightened` | none | Friendly maximum mana is at least 10. |
| `deep` | none | Controller deck has 15 or fewer cards. |
| `topDeckRegion` | `region` | Top deck card has the region. |
| `plunder` | none | Friendly team plundered this round. |
| `daybreak` | none | No cards played by the friendly team this round. |
| `nightfall` | none | At least one card played by the friendly team this round. |
| `round` | `op`, `value` | Current round number. |
| `sourceAttacking` / `sourceBlocking` | none | Source is in the current combat role. |
| `sourceLeveled` | none | Source champion is leveled. |
| `selfStrikesThisGame` | `op`, `value` | Source's lifetime strike count. |
| `counter` | `counter`, `op`, `value` | Named counter on the source. |
| `eventTeam` | `who` (`ally` default or `enemy`) | The event entity belongs to the controller's team or the enemy team. |
| `eventNotSource` | none | The event entity is not the trigger's source unit. |
| `lastTargetFollower` | none | The previous target was a non-champion, non-landmark unit. |
| `targetChampion` | none | Event target is a champion. |
| `event` | `value` | Current event equals the value. |
| `eventCard` | `filter` | The event's card or unit matches the filter. Reads `summoned`, `played`, `card`, `spell`, `equipment`, or `target` from the event context. |
| `firstTimeThisRound` | `flag` | Consumes a per-player round flag; resets at round start. |
| `firstTimeThisGame` | `flag`, `scope` | Consumes a game flag; `scope: "controller"` (default) shares it per player, while `scope: "source"` keeps it per source instance. Does not reset at round start. |
| `cardsPlayedThisRound` / `damageTakenThisRound` / `damageDealtThisRound` | `op`, `value` | Friendly team round counters. |
| `cardsDrawnThisRound` | `op`, `value` | Controller draws this round. |
| `cardsDrawnInARoundThisGame` | `op`, `value` | Largest single-round draw count this game. |
| `equipsThisGame` | `op`, `value` | Controller equipment plays this game. |
| `sourceEquipped` | none | Source unit has attached equipment. |
| `attackerEquipped` | none | At least one current attacker has attached equipment. |
| `behold` | `filter` | A matching card is in the controller's hand, on their board, or attached as equipment. Filters include `type`, `subtype`, `supertype`, `region`, `keyword`, `minCost`, and `maxCost`. Keyword matching also inspects card text, so `Nightfall` works even though it is not a data keyword. |
| `healWasDamaged` | none | The heal event restored a damaged ally. |
| `reputation` | `op`, `value` | Controller damage dealt to the enemy Nexus; default threshold is 4. |
| `allegiance` | `region` (optional) | Top deck card shares a region with the source, or with `region` when supplied. |
| `lurkActive` | none | The friendly team attacked with a Lurker this round. |
| `fated` | none | Source has the Fated keyword or `Fated` in its card text. |
| `flow` / `evolve` / `augment` / `hallowed` / `brash` / `formidable` | none | Source has the matching static keyword. |
| `custom` | none | **Rejected.** It used to return true unconditionally and is not a real condition. |

Unknown condition types return `false` and write an error to the game log.
Semantic lint rejects them.

### Daybreak and Nightfall

`daybreak` and `nightfall` describe the state of the round, not an event. Use
them as trigger conditions:

```json
{
  "on": "play",
  "condition": { "type": "daybreak" },
  "actions": [{ "type": "draw", "amount": 1 }]
}
```

## Auras

`aura` triggers are read by `Game.recalcAuras()` rather than `runScript()`.
They recalculate static stat and keyword modifiers whenever the board changes.
Only these action types are honored:

- `buff` / `give`
- `debuff`
- `grantKeyword`

The default target is `allOtherAllyUnits`. Auras do not prompt for choices and
do not use the resolution stack. Conditions are evaluated with the aura source
as `source` and its owner as `controller`.

```json
{
  "triggers": [
    {
      "on": "aura",
      "actions": [
        {
          "type": "buff",
          "power": 1,
          "target": "allOtherAllyUnits"
        }
      ]
    }
  ]
}
```

## Examples

### Play: deal 2 to an enemy unit

```json
{
  "status": "curated",
  "script": {
    "triggers": [
      {
        "on": "play",
        "actions": [
          {
            "type": "damage",
            "amount": 2,
            "target": { "type": "enemyUnit" }
          }
        ]
      }
    ]
  }
}
```

`enemyUnit` prompts the controller when the card is played from hand. During an
automatic trigger it picks a random legal enemy.

### Summon: grant yourself +1|+1

```json
{
  "status": "curated",
  "script": {
    "triggers": [
      {
        "on": "summon",
        "actions": [
          {
            "type": "buff",
            "power": 1,
            "health": 1,
            "target": { "type": "self" }
          }
        ]
      }
    ]
  }
}
```

### Play: draw 1 if you have three allies

```json
{
  "status": "curated",
  "script": {
    "triggers": [
      {
        "on": "play",
        "condition": { "type": "allyCount", "op": ">=", "value": 3 },
        "actions": [{ "type": "draw", "amount": 1 }]
      }
    ]
  }
}
```

### Last Breath: draw 1

```json
{
  "status": "curated",
  "script": {
    "triggers": [
      {
        "on": "death",
        "actions": [{ "type": "draw", "amount": 1 }]
      }
    ]
  }
}
```

### Attack: give other allies +1|+0 this round

```json
{
  "status": "curated",
  "script": {
    "triggers": [
      {
        "on": "attack",
        "actions": [
          {
            "type": "buff",
            "power": 1,
            "health": 0,
            "duration": "round",
            "target": { "type": "allOtherAllyUnits" }
          }
        ]
      }
    ]
  }
}
```

### Champion level-up

```json
{
  "status": "curated",
  "script": {
    "levelUp": {
      "condition": { "type": "allyDiedThisRound" }
    },
    "triggers": [
      {
        "on": "levelUp",
        "actions": [
          {
            "type": "grantKeyword",
            "keyword": "Fearsome",
            "target": { "type": "self" }
          }
        ]
      }
    ]
  }
}
```

The engine checks `script.levelUp.condition` in `checkLevelUps()`, swaps to the
`level2Id` card, then fires the `levelUp` trigger. The `levelUp` action does not
check the condition; do not use it for champion level-ups.

### Aura: other allies have +1|+0

```json
{
  "status": "curated",
  "script": {
    "triggers": [
      {
        "on": "aura",
        "actions": [
          {
            "type": "buff",
            "power": 1,
            "target": "allOtherAllyUnits"
          }
        ]
      }
    ]
  }
}
```

### If / else

```json
{
  "status": "curated",
  "script": {
    "triggers": [
      {
        "on": "play",
        "actions": [
          {
            "type": "if",
            "condition": { "type": "allyCount", "op": ">=", "value": 3 },
            "actions": [{ "type": "draw", "amount": 2 }],
            "elseActions": [{ "type": "draw", "amount": 1 }]
          }
        ]
      }
    ]
  }
}
```

### Two chosen targets

```json
{
  "status": "curated",
  "script": {
    "triggers": [
      {
        "on": "play",
        "actions": [
          {
            "type": "buff",
            "power": 1,
            "health": 1,
            "target": { "type": "allyUnit", "count": 2 }
          }
        ]
      }
    ]
  }
}
```

Only use `count` above 1 when the effect can always find that many legal
targets. If it cannot, the choice prompt cannot be completed.

## Validation and lint

There are two separate checks:

1. **Shape validation** — `server/script-validation.js` (`validateScript`).
   Checks the JSON envelope, trigger and action array shapes, counts, and size
   limits. It does not know whether an action or target exists.
2. **Semantic lint** — `server/script-lint.js` (`lintScript`).
   Checks trigger/action/target/condition vocabulary, required fields, nested
   control flow, duplicate events, empty scripts, empty action lists, `custom`,
   `firstTimeThisRound`, filters, and unknown fields.

Admin saves and peer content sanitization run both. Peer scripts are forced to
`custom` and have `verification` and `seed` stripped. CI runs
`npm run scripts:lint` before the test suite; seed scripts must have zero
warnings in strict mode.

`lintScript` warnings are not automatically safe to ignore. For seed scripts,
treat any warning as a failure. Empty scripts (zero triggers and no `levelUp`)
are warnings because a placeholder can be intentional; empty trigger action
lists are errors.

## Limitations and gotchas

These are current engine constraints, not behavior to preserve. Fix one in a
separate engine batch when a card needs it.

| Area | Current behavior | Consequence |
| --- | --- | --- |
| `damageAll` | Hits only one team (`action.team`, default friendly) | "Deal 1 to all units" needs two actions or a new mode. |
| `discard` | Random by default; `random: false` discards the first card | "Discard a card of your choice" is not expressible. |
| `predict` | Automatically takes the highest-cost card | Not a player choice. Do not use for printed Predict. |
| `summon` / `create` by name | First matching token wins | Duplicate token names can produce the wrong card. |
| `addToHandFromDeck` | Random card from deck | Cannot draw a specific card. |
| `copy` | Units only | Cannot copy spells, landmarks, or equipment. |
| `levelUp` action | Calls `game.levelUp(source)` unconditionally | Use `script.levelUp.condition`. |
| `firstTimeThisRound` | Consumes a per-player flag | Implemented; resets at round start. Use distinct flag names for unrelated conditions. |
| `custom` condition | Removed from vocabulary | Rejected by lint and unknown to the engine. |
| `target.count` on `all*` | Ignored | Every matching entity is affected. |
| `all*Units` targets | Exclude landmarks | Use `allyLandmark` / `enemyLandmark` for landmarks. |
| `target.count` on choice targets | Exact min and max | Too few legal targets makes the prompt unsatisfiable. |
| `strongest*` / `weakest*` auto resolution | Ignores the target filter | Filtered strongest/weakest is not supported yet. |
| `anyNexus` auto resolution | Picks the enemy Nexus | Do not rely on random Nexus selection. |
| Unknown target type | No targets and an error log | Never all units. |
| Unknown action type | Error log and no effect | Lint rejects it. |
| Unknown condition type | `false` and an error log | Lint rejects it. |
| Trigger-level `auto` | Ignored by `Game.runScript()` | Remove it from new scripts. |
| `aura` | Only buff/debuff/grantKeyword, default other allies | No choices, no arbitrary actions. |
| `hasKeyword` with `target: "enemy"` | Checks the first enemy only | Not a team-wide check. |
| `topDeckRegion` | Checks only the top card | Allegiance-style effects need a matching card setup. |
| `targetChampion` | Reads the event target | Only meaningful on events that supply `target`. |
| `daybreak` / `nightfall` | Conditions, not triggers | Do not use them as `on` values. |

Not yet implemented as events: none of the registered trigger events are
unimplemented. `behold`, `reputation`, `flow`, `allegiance`, `fated`, and the
static keyword mechanics are conditions, not events. Do not invent trigger
names for them.

Not yet implemented as targets: `owner`, `topDeck`, `bottomDeck`, `deckChoice`,
`chosenUnit`, `chosenAlly`, `chosenEnemy`, `allyEquipment`, `enemyEquipment`.

Not yet implemented as actions: generic `attach` from outside hand (equipment
from hand uses `equipFromHand`), `advanceCountdown`/`destroyLandmark`,
non-random discard from hand, choose-from-deck with a predicate beyond the top
N (`pickFromTop`), `setStats`, `swapStats`, `reveal`, `predictChoose`,
`grantAura`, `strikeNexus`, `moveToHand` (use `recall`), `increaseMaxMana`,
`refillMana`, `copyCard`, `createInDeck`, `obliterateDeck`, `silenceAll`, and
`stunAll`.

## Authoring workflow

1. Read the canonical card from `data/cards.json`; do not use memory or an
   external wiki.
2. Split the printed text into clauses.
3. Classify each clause: event, condition, target, action, duration, optional.
4. Check the vocabulary above. If a clause needs something missing, stop and
   either add it in a separate engine-change batch or mark the card blocked.
5. Write the smallest script that covers the clauses.
6. Add a deterministic regression test. The test must fail if the script is
   removed.
7. Run semantic lint. Seed scripts need zero errors and zero warnings.
8. Run `npm run test:all`.
9. Add verification metadata only after the test and review pass.
10. Use the batch merge tool instead of hand-rewriting `data/scripts.json`.

See [AGENTS.md](../AGENTS.md) for the per-card workflow, batch format, and exit
gates. See [docs/testing.md](testing.md) for the full test procedure.

## Reporting and status

Report **scripts present** and **verified effects** separately:

- Scripts present = text cards with any script entry (`auto`, `partial`, or
  `curated`).
- Verified effects = `curated` entries with valid verification metadata and a
  matching card-text hash.
- Missing = text cards with no entry. Do not call generated scripts
  "automated."

Use `npm run scripts:coverage` for the current numbers. Do not describe a
generated script as correct, and do not call 16% coverage "16% of the game
works."
