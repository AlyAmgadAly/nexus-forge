# AGENTS.md — Gameplay Script Roadmap

> Operating guide for agents working on Nexus Forge card-effect automation.
> Read this file completely before editing `data/scripts.json`, `server/engine/effects.js`,
> `server/engine/game.js`, `server/script-validation.js`, or `scripts/autoscript.mjs`.
>
> Last audited: **2026-10-27**
> Baseline release: **0.3.0** (`release/NexusForge-0.3.0-portable.exe`)
>
> Re-measure every count in this file before trusting it. Counts are a snapshot,
> not a contract. The contracts are the exit gates in [Section 7](#7-roadmap).
>
> Ordered execution plans:
> - [Implementation order](docs/agents/implementation-order.md)
> - [Testing order](docs/agents/testing-order.md)
> - [Manual in-game test plan](docs/agents/manual-game-testing.md)

---

## 0. Mission

Make every collectible card with rules text resolve its printed effect inside the
authoritative engine, using only the declarative JSON effect DSL.

"Resolve" means:

1. A script exists.
2. Every clause of the printed text maps to a trigger, condition, target, and action.
3. An automated regression test proves each clause.
4. A human or reviewing agent marks the card verified.
5. The script survives release upgrades without overwriting local user scripts.

Adding a script is not completion. Coverage is not correctness.

---

## 1. Non-negotiable rules

These rules protect game integrity, user data, and the security model. Do not
trade them for speed.

1. **Scripts are data, never code.** Never add `eval`, `Function`, `import()`,
   `require`, or JavaScript execution to the DSL, peer transfer path, or admin
   path. Peer-supplied content must remain declarative and bounded.
2. **Do not modify `data/cards.json` to make a script fit.** Card text, IDs,
   stats, regions, and keywords are source data. Fix the script or the engine.
3. **Do not rewrite printed card text.** If the text is ambiguous, mark the card
   `blocked` with a note. Do not invent behavior from memory or external sites.
4. **Never overwrite user data.** `scripts.json` is writable per-user data.
   Seed scripts must merge into existing installations with a backup, not
   replace the file. Never delete `custom` entries.
5. **Preserve unrelated working-tree changes.** This repository currently has
   uncommitted deck-builder, UI, and documentation work. Do not revert, format,
   or "clean up" files outside the current batch.
6. **Do not run `npm run autoscript` against the real `data/scripts.json`
   without a backup and review.** It rewrites every `auto` entry, drops entries
   for cards not in the seed payload, and does not preserve `manual` entries.
   See [Section 11](#11-tooling-safety).
7. **One mechanic per batch.** Small, reviewable batches beat bulk generation.
   A 200-card batch cannot be semantically reviewed.
8. **No silent fallbacks.** If a trigger, target, condition, or action is
   unknown, the validator and engine must report it. Never let an unknown target
   silently become "all units."
9. **Keep the UI and gameplay presentation out of scope.** This roadmap changes
   scripts, engine semantics, validation, tests, and reporting only. Do not
   redesign card views, deck rows, filters, artwork, or layouts.
10. **Published behavior must be reproducible.** Tests use fixed seeds and
    deterministic setups. No network, no wall-clock timing, no art assets.

---

## 2. Where the script system lives

| Path | Responsibility | Change policy |
| --- | --- | --- |
| `data/cards.json` | Pinned Data Dragon card payload (2,512 records) | Read-only source data |
| `data/scripts.json` | Script entries shipped with releases (288; 282 collectible text + 5 generated/level-2 + 1 local custom excluded from packages) | Batch edits only, with validation |
| `server/engine/carddb.js` | Loads cards, scripts, settings; derives `script`, `scriptStatus`, `level2Id`, `hasSkill` | Status/metric fixes allowed |
| `server/engine/effects.js` | DSL interpreter: targets, conditions, action execution, choice prompts, resolution stack | Core engine work |
| `server/engine/game.js` | Game state, combat, death, level-up, stack, actual trigger dispatch | Core engine work |
| `server/engine/constants.js` | Keyword aliases and canonical keyword names | Additive aliases only |
| `server/script-validation.js` | Shape/size validation of scripts received from admin/peers | Shape only; semantic checks live in `server/script-lint.js` |
| `server/script-lint.js` | Semantic DSL validation for admin, peer, and CI paths | Core Phase 0 validation work |
| `shared/script-vocabulary.js` | Single source for triggers, actions, targets, conditions, filters | Add only implemented vocabulary |
| `shared/manifest.js` | `KNOWN_TRIGGERS`, manifest comparison, content compatibility | Re-export from the single vocabulary source |
| `shared/protocol.js` | Size limits (`MAX_SCRIPT_BYTES = 64 KB`) and protocol constants | Do not weaken limits |
| `server/store.js` | Per-user `scripts.json`, seed copying, `setScript` | Seed merge and metadata preservation |
| `server/data-migration.js` | First-launch legacy data migration with backups | Must include script upgrades |
| `server/service.js` | Admin stats, script GET/PUT/DELETE/validate endpoints | Reporting and API semantics |
| `server/content.js` | Sanitizes peer content; accepts declarative scripts only | Security boundary |
| `public/js/views/admin.js` | Script workshop and coverage dashboard | Minimal reporting copy only |
| `scripts/autoscript.mjs` | Conservative text-to-DSL generator | Add safe modes before reuse |
| `test/engine.test.mjs` | Deterministic engine and DSL regression tests | Extend continuously |
| `test/protocol.test.mjs` | Manifest, sanitization, and script-boundary tests | Extend with registry parity |
| `test/migration.test.mjs` | Data migration and backup behavior | Extend with script merge |
| `docs/testing.md` | Test procedure | Update counts when verified |
| `ROADMAP.md` | Product roadmap; defers full card scripting | Do not duplicate this file there |

The Phase 0 infrastructure paths now exist: `server/script-lint.js`,
`shared/script-vocabulary.js`, `scripts/coverage-report.mjs`,
`scripts/apply-batch.mjs`, and `docs/effect-dsl.md`. The files under
`docs/scripts/` are still created by the phase that needs them.

### Actual trigger dispatch sites in `server/engine/game.js`

Triggered events are prepared through `emitEvents()` and appended to the FIFO
event queue. `runScript()` is the single-entry convenience wrapper. The
current dispatch sites are:

| Event | Notes |
| --- | --- |
| `surviveDamage` | Source unit survived damage |
| `damageUnit` | Unit took damage; prepared before death processing and queued before death watchers |
| `damageNexus` | Nexus took damage |
| `heal` | Unit or Nexus was actually healed |
| `death` | The dying unit's own Last Breath |
| `allyDeath` / `enemyDeath` | Other units watching a death; batched with the death |
| `roundStart` | All units queued as one sorted batch at round start |
| `roundEnd` | All units queued as one sorted batch at round end |
| `spellCast` / `castSpell` / `enemySpell` | Friendly spell watchers use the canonical `spellCast` event; `castSpell` is an alias; enemy watchers use `enemySpell` |
| `play` | Spell, unit, equipment, and champion-duplicate play |
| `playCard` | Non-spell unit, landmark, equipment, and champion-duplicate play watchers |
| `summonOther` / `enemySummon` | Watchers of a summon; one mixed batch |
| `summon` | The summoned unit itself |
| `attack` / `allyAttack` | Attackers and other allies; one mixed batch |
| `block` | Attacker/blocker pair; dispatched to both units |
| `support` / `supported` | A Support attacker is linked to another attacker; dispatched to the supporter and the supported unit |
| `lurk` | The attacking team has a Lurker; dispatched to allied Lurk watchers |
| `targeted` | A spell action targets a unit; the target history is recorded before the action resolves |
| `nexusStrike` | Unit struck a Nexus |
| `strike` | Unit struck a unit |
| `discard` | Discarded card's own script plus on-board watchers |
| `equip` | Equipment attached to a unit |
| `detach` | Equipment removed from a unit, either returned to hand or destroyed |
| `countdown` | Landmark countdown advanced; queued before destruction |
| `spellKill` | A spell source killed a non-landmark unit; watchers on the spell caster's team |
| `levelUp` | Champion leveled up |
| `transform` | Unit transformed |

Phase 0 removed the dead `fireEvent` path and routed dispatch through
`EVENTS` constants from `shared/script-vocabulary.js`. Phase 1.1 routed every
trigger through the central event queue. The queue orders simultaneous triggers
by active team, then seat, then semantic phase, board position, and creation
order; it logs the order when a batch has more than one trigger. Nested control
flow still uses the LIFO resolution stack.

`aura` is special-cased: `recalcAuras()` reads `on: "aura"` triggers directly
instead of using the event queue. Auras honor only `buff`/`give`, `debuff`, and
`grantKeyword`; other actions are ignored in the aura path.

Event context keeps `source` as the unit whose trigger is resolving, so `self`
targets remain correct for watchers. The cause of a damage, heal, or discard
event is exposed as `eventSource`. Event-specific fields such as `damaged`,
`amount`, `lethal`, `nexus`, `card`, `random`, `reason`, `equipped`, and
`countdown` are merged into the trigger context. Phase 1.3 added the state
model and dispatch sites for `support`/`supported`, `targeted`, `detach`, and
`lurk`. `behold`, `reputation`, `flow`, `allegiance`, `fated`, and the static
keyword mechanics (`evolve`, `augment`, `hallowed`, `brash`, `formidable`) are
conditions over existing state, not trigger events.

---

## 3. Definitions

| Term | Meaning |
| --- | --- |
| **Text card** | Collectible, enabled card with non-empty `text` |
| **Coverage** | Text cards with any script object, regardless of correctness |
| **Verified** | Script is `curated` and has verification metadata referencing a passing test |
| **Missing** | Text card with no script |
| **Blocked** | Text card that cannot be expressed until an engine event/primitive exists |
| **Clause** | One independently testable sentence or clause in the printed text |
| **Batch** | 8–12 cards sharing one mechanic, with one engine change at most |
| **Engine-change batch** | A batch that adds an event, condition, target, or action before card work |
| **Card-data batch** | A batch that only maps existing DSL to card text |

### Status taxonomy

Use exactly these statuses. Packaged seed data must not contain `custom`; that
status is for per-user scripts. The local working `data/scripts.json` may contain
`custom` entries for custom cards, which `scripts/build-seed.mjs` excludes from
the package.

| Status | Meaning | Counts toward coverage? | Counts toward verified? |
| --- | --- | --- | --- |
| `none` | No rules text (vanilla unit, token, etc.) | No | No |
| `manual` | Has rules text; no script yet | No | No |
| `auto` | Machine-generated; not semantically verified | Yes | No |
| `partial` | Script covers some clauses only | Yes | No |
| `curated` | Hand-authored and verified by test + review | Yes | Yes |
| `custom` | Local user script, never shipped or verified | Yes (locally) | No |

Do not add a new status for "missing." Missing is the absence of an entry on a
text card, and reporting must derive it. Do not call `auto` "automated" in
user-facing copy; call it "generated, unverified."

### Verification metadata

`curated` entries should carry:

```json
{
  "status": "curated",
  "script": { "triggers": [] },
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
  },
  "seed": { "version": "0.3.0", "origin": "seed" }
}
```

`cardTextHash` detects when Riot text changes under an existing script. A hash
mismatch must downgrade the card to `partial` in reports until re-verified.

---

## 4. Measured baseline (2026-10-27, post-0.3.0 Reckless batch)

Generated from `data/cards.json`, `data/scripts.json`, and the effective
`CardDB.decorate()` status logic after the Reckless Revenants batch 1. Full
report: `docs/scripts/coverage-0.3.0.md` (this working-tree report does not
describe the published 0.3.0 artifact).

### Catalog

| Metric | Value |
| --- | ---: |
| Total card records | 2,512 |
| Collectible / enabled | 1,647 |
| Collectible with rules text | 1,552 |
| Collectible without rules text | 95 |
| Entries in `data/scripts.json` | 288 (282 collectible text + 5 generated/level-2 + 1 custom-card entry) |
| Scripts attached to a pinned collectible text card | 282 |
| Text cards lacking a script | **1,270** |
| Coverage | **18.2%** |
| Verified (`curated` + metadata + test) | **56** (3.6%) |
| Effective status `auto` | 226 |
| Effective status `manual` | 1,270 |
| Effective status `none` | 95 |
| Effective status `partial` | 0 |
| Effective status `curated` | 56 |

The packaged seed contains 287 pinned entries: 282 collectible text scripts plus
five generated/level-2 scripts. One local seed entry, `C343DC2`, belongs to the
custom card "Smoke Test Sentinel" in `data/custom-cards.json`, which is not part
of the pinned catalog. It is a local `custom` entry, not a card from
`data/cards.json`. Seed builds must exclude custom-card entries; do not delete
the user's custom card.

### Text cards by type

| Type | Total text cards | Scripted | Missing |
| --- | ---: | ---: | ---: |
| Unit | 773 | 168 | 605 |
| Spell | 566 | 94 | 472 |
| Champion | 105 | 16 | 89 |
| Landmark | 81 | 2 | 79 |
| Equipment | 27 | 2 | 25 |
| **Total** | **1,552** | **282** | **1,270** |

### Missing scripts by set

| Set | Text cards | Scripted | Missing |
| --- | ---: | ---: | ---: |
| Set1 | 279 | 104 | 175 |
| Set2 | 110 | 25 | 85 |
| Set3 | 176 | 33 | 143 |
| Set4 | 211 | 38 | 173 |
| Set5 | 219 | 29 | 190 |
| Set6 | 113 | 10 | 103 |
| Set6cde | 171 | 18 | 153 |
| Set7 | 57 | 10 | 47 |
| Set7b | 52 | 1 | 51 |
| Set8 | 106 | 9 | 97 |
| Set9 | 58 | 5 | 53 |

Set order is **not** the implementation order. Use mechanic frequency and the
starter-deck cohort.

### Starter-deck cohort (first real target)

Six starter decks:

1. Vanguard Disciplines (Demacia + Ionia) — **complete 29/29 verified**
2. Reckless Revenants (Noxus + Shadow Isles) — **in progress 18/31 verified**
3. Frost & Flame (Freljord + Piltover & Zaun)
4. Tides of the Peak (Bilgewater + Targon)
5. Sands & Secrets (Shurima + Bandle City)
6. Runeterra Wanderers (Targon)

| Metric | Value |
| --- | ---: |
| Unique cards across the six starter decks | 206 |
| Unique cards with rules text | 179 |
| Text cards already scripted | 73 |
| Text cards missing scripts | **106** |
| Scripted cards marked `curated` | 47 |

| Deck | Unique | Text | Scripted | Verified | Missing |
| --- | ---: | ---: | ---: | ---: | ---: |
| Vanguard Disciplines | 37 | 29 | 29 | 29 | 0 |
| Reckless Revenants | 37 | 31 | 19 | 18 | 12 |
| Frost & Flame | 37 | 32 | 4 | 1 | 28 |
| Tides of the Peak | 37 | 32 | 10 | 0 | 22 |
| Sands & Secrets | 37 | 34 | 6 | 0 | 28 |
| Runeterra Wanderers | 39 | 36 | 9 | 0 | 27 |

The cohort total is unique across decks; per-deck counts can double-count a card
that appears in more than one starter. `06DE024` Catch! is Vanguard's verified
card and also appears in Frost & Flame, so the per-deck verified column sums to
48 while the unique total is 47. Vanguard is 29/29; Reckless Revenants is 18/31
with 12 missing and one existing `auto` script (Draven). The other four decks
contain 95 unique text cards without scripts and no new verified cards. Re-run
`npm run scripts:coverage` before using these numbers; they are a snapshot, not a
contract.

This cohort is small enough to finish and broad enough to exercise every region.

### Existing script vocabulary

Trigger frequency in `data/scripts.json` (the custom-card entry has no triggers):

| Trigger | Entries |
| --- | ---: |
| `play` | 136 |
| `summon` | 66 |
| `death` | 15 |
| `attack` | 14 |
| `roundStart` | 13 |
| `strike` | 9 |
| `summonOther` | 9 |
| `nexusStrike` | 8 |
| `surviveDamage` | 6 |
| `castSpell` | 4 |
| `support` | 4 |
| `barrier` | 3 |
| `allyDeath` | 2 |
| `roundEnd` | 2 |
| `block` | 1 |
| `equip` | 1 |
| `playCard` | 1 |
| `recall` | 1 |
| `spellKill` | 1 |
| `supported` | 1 |

Action frequency:

| Action | Uses |
| --- | ---: |
| `buff` | 83 |
| `create` | 58 |
| `summon` | 46 |
| `grantKeyword` | 24 |
| `damage` | 23 |
| `draw` | 14 |
| `createRandom` | 12 |
| `damageAll` | 11 |
| `stun` | 8 |
| `heal` | 8 |
| `recall` | 7 |
| `toss` | 6 |
| `rally` | 5 |
| `frostbite` | 5 |
| `barrier` | 4 |
| `choose` | 4 |
| `emptyManaGem` | 4 |
| `predict` | 4 |
| `kill` | 3 |
| `copy` | 2 |
| `if` | 2 |
| `silence` | 2 |
| `addCounter` | 1 |
| `capture` | 1 |
| `destroyEquipment` | 1 |
| `drain` | 1 |
| `equipFromHand` | 1 |
| `healNexus` | 1 |
| `moveCardToTop` | 1 |
| `nextSummon` | 1 |
| `obliterate` | 1 |
| `pickFromTop` | 1 |
| `reduceCost` | 1 |
| `spellMana` | 1 |
| `strike` | 1 |
| `swap` | 1 |
| `transform` | 1 |

Garen (`01DE012`) and Shen (`01IO032`) now carry verified `levelUp` conditions
and level-two scripts. Draven (`01NX020`) remains `auto` and Elise (`01SI053`)
remains missing; both Reckless Revenants champions are blocked on their printed
level-up and level-two behavior. The broader champion level-up requirement
remains a Phase 3 item; do not assume other champions have conditions just
because the engine supports them.

---

## 5. Current DSL surface

### Trigger names in `shared/script-vocabulary.js`

`play`, `playCard`, `summon`, `attack`, `allyAttack`, `block`, `strike`,
`nexusStrike`, `surviveDamage`, `damageUnit`, `damageNexus`, `heal`, `death`,
`allyDeath`, `enemyDeath`, `summonOther`, `enemySummon`, `roundStart`,
`roundEnd`, `spellCast`, `castSpell` (alias), `enemySpell`, `discard`, `equip`,
`detach`, `support`, `supported`, `lurk`, `targeted`, `countdown`, `spellKill`,
`levelUp`, `transform`, `aura`.

`spellKill` fires when a spell source kills a non-landmark unit; it is a watcher
event on the spell caster's team, not a death replacement.

`behold`, `reputation`, `flow`, `allegiance`, `fated`, `evolve`, `augment`,
`hallowed`, `brash`, and `formidable` are conditions, not trigger events. Do not
register a trigger for them; adding a registry entry without a dispatch site is
forbidden.

`shared/manifest.js` re-exports `KNOWN_TRIGGERS` from this registry. The
registry, dispatch sites, lint, and manifest now agree; a parity test fails if
they drift.

### Action types implemented by `EffectRunner.execute`

`damage` / `dealDamage`, `damageAll`, `damageNexus`, `heal` / `healUnit`,
`healNexus`, `buff` / `give`, `debuff`, `grantKeyword`, `removeKeyword`,
`barrier`, `spellShield`, `stun`, `frostbite`, `recall`, `silence`, `kill`,
`obliterate`, `draw`, `discard`, `summon`, `create`, `createRandom`, `mana`,
`spellMana`, `emptyManaGem`, `rally`, `strike`, `fight`, `levelUp`, `transform`
(unit or hand card), `copy`, `toss`, `predict`, `counter`, `shuffle`,
`addToHandFromDeck`, `destroyEquipment`, `detach`, `moveToDeck`, `equipFromHand`,
`pickFromTop`, `capture`, `swap`, `nextSummon`, `addCounter`, `drain`,
`reduceCost`, `moveCardToTop`, `log`, `noop`,
plus control flow `if`, `random`, `repeat`, `choose`, and `pickFromTop`.

### Target types implemented by `targetOptions`

Choice targets: `allyUnit`, `otherAllyUnit`, `enemyUnit`, `anyUnit`,
`anyNexus`, `anyTarget`, `allyTarget`, `allyChampion`, `enemyChampion`,
`allyFollower`, `enemyFollower`, `allyLandmark`, `enemyLandmark`, `handCard`.

Automatic targets: `none`, `self`, `allyNexus`, `enemyNexus`, `attacker`,
`blocker`, `strikeTarget`, `supporter`, `supported`, `strongestAlly`,
`weakestAlly`, `strongestEnemy`, `weakestEnemy`, `randomAllyUnit`,
`randomOtherAllyUnit`, `randomEnemyUnit`, `randomUnit`, `allAllyUnits`,
`allOtherAllyUnits`, `allEnemyUnits`, `allOtherEnemyUnits`, `allUnits`,
`allBattlingUnits`, `allAttackingUnits`, `allDefendingUnits`,
`allDamagedAllyUnits`, `allDamagedEnemyUnits`, `allChampionAllies`,
`allChampionEnemies`, `lastTargets`, `lastRecalled`, `eventUnit`.

### Reserved target names

The still-unimplemented `AUTO_TARGETS` names are `owner`, `topDeck`, `bottomDeck`,
`deckChoice`, `chosenUnit`, `chosenAlly`, `chosenEnemy`, `allyEquipment`, and
`enemyEquipment`. They are not registered; semantic lint rejects them, and
`targetOptions` returns no targets and logs an error rather than falling back to
all units.

### Conditions implemented by `evalCondition`

`always`, `not`, `and`, `or`, `allyCount`, `enemyCount`, `boardCount`,
`selfPower`, `selfHealth`, `selfMaxHealth`, `selfCost`, `hasKeyword`,
`sourceKeyword`, `sourceDamaged`, `mana`, `spellMana`, `handCount`,
`enemyHandCount`, `deckCount`, `nexusHealth`, `allyDiedThisRound`,
`unitsDiedThisRound`, `spellsPlayedThisRound`, `spellsPlayedThisGame`,
`manaSpentOnSpellsThisGame`, `stunnedOrRecalled`, `enlightened`, `deep`,
`topDeckRegion`, `plunder`, `daybreak`, `nightfall`, `round`,
`sourceAttacking`, `sourceBlocking`, `sourceWasBlocked`, `sourceLeveled`,
`targetChampion`, `selfStrikesThisGame`, `counter`, `eventTeam`,
`eventNotSource`, `lastTargetFollower`, `event`, `eventCard`,
`firstTimeThisRound`, `firstTimeThisGame`, `cardsPlayedThisRound`,
`cardsDrawnThisRound`, `cardsDrawnInARoundThisGame`, `damageTakenThisRound`,
`damageDealtThisRound`, `equipsThisGame`, `sourceEquipped`,
`attackerEquipped`, `behold`, `healWasDamaged`, `reputation`, `allegiance`,
`lurkActive`, `fated`, `flow`, `evolve`, `augment`, `hallowed`, `brash`,
`formidable`.

`firstTimeThisRound` consumes a per-player flag and resets at round start;
`firstTimeThisGame` consumes a per-game flag and accepts `"scope": "source"` for
per-card once-per-game effects. `custom` was removed from the vocabulary; it is
rejected by lint and returns `false` with an error if hand-edited into a script.

### Filters

`targetOptions` and `damageAll` accept a `filter` object. Implemented fields:

`type` (`champion`, `follower`, `landmark`, `unit`, `equipment`), `types`,
`keyword`, `notKeyword`, `minPower`, `maxPower`, `minHealth`, `maxHealth`,
`minCost`, `maxCost`, `damaged`, `region`, `subtype`, `supertype`,
`excludeSource`, `excludeUid`, `champion`, `equipped`, `excludeChosen`.

Filters apply to units only. `handCard` has its own smaller filter path
(`maxCost`, `minCost`, `type`, `types`, `keyword`, `notKeyword`, `region`,
`subtype`, `supertype`). The card-pool path used by `create`/`createRandom`
(`Game.randomCard`) additionally supports `excludeIds`; `type: "follower"`
matches non-champion Units, and keyword matching also inspects printed card text.

### Known semantic limitations in current actions

These are constraints to account for while authoring, not behavior to preserve.
Fix one in Phase 1 if a batch depends on it.

| Area | Current behavior | Consequence |
| --- | --- | --- |
| `damageAll` | Hits only the team selected by `action.team` (defaults to your team) | "Deal 1 to all units" needs two actions or a new `both` mode |
| `discard` | Random by default; `random: false` discards the first card | "Discard a card of your choice" is not expressible |
| `predict` | Automatically takes the highest-cost card from the top N | Not a player choice; do not use for "Predict" cards until fixed |
| `create` / `summon` by `name` | Resolves the first matching token by name | Duplicate token names can produce the wrong card |
| `addToHandFromDeck` | Picks a random card from the deck | Cannot model "draw a specific card" |
| `copy` | Copies a unit only | Cannot copy spells, landmarks, or equipment |
| `levelUp` action | Calls `game.levelUp(source)` unconditionally | It does not check the level-up condition; use `script.levelUp.condition` |
| `targeted` | Dispatched only when a spell action targets a unit | Unit skills do not dispatch it yet; Fated-style unit skills need a later expansion |
| Equipment death | A dead unit's attached equipment returns to hand | `destroyEquipment` discards instead; do not assume every detach destroys |
| Support targeting | Each Support attacker auto-supports another attacker or itself unless the attack call supplies a `supports` map | The UI does not yet prompt for support links |
| `custom` condition | Removed from vocabulary; lint rejects | Never use in shipped scripts |
| `target.count` on `all*` targets | Ignored; every matching entity is affected | Use a choice target for "one" and an all-target for "all" |
| `target.count` on choice targets | Exact min and max | Too few legal targets makes the prompt unsatisfiable |
| `strongest*` / `weakest*` auto resolution | Ignores the target filter | Filtered strongest/weakest is not supported yet |
| `drain` | Heals for the damage actually dealt | Barrier, Tough, and overkill change the heal amount; this is intended and tested |
| `spellKill` | Requires a spell source and excludes landmarks | Landmark destruction and non-spell kills do not count |
| `create` with `who: "enemy"` | Creates for every enemy-team player | 2v2 behavior is implemented but only 1v1 is tested |
| `reduceCost` | Stores a modifier on the hand entry; applies to play cost and the hand view | Does not reduce cards in deck, discard, or play |
| `moveCardToTop` | Matches a printed name or explicit `cardId`; refuses if it is already in hand or play | Duplicate names move the first matching deck copy |
| Trigger-level `auto` | Ignored by `Game.runScript()` | Remove it from new scripts |

---

## 6. Integrity defects to fix before bulk authoring

These are not optional cleanup. Each one can make coverage statistics, upgrade
behavior, or card behavior lie.

> **Phase 0 resolution (2026-10-27):** 6.1-6.7, 6.9, and 6.10 are fixed.
> 6.8 is fixed: `custom` was removed, conditions are documented,
> `script.levelUp.condition` is validated, and Phase 1.3 added the
> `firstTimeThisRound`/`firstTimeThisGame` flag setters. The audit text below is
> retained as the record of what was wrong, not as current behavior.

### 6.1 All seed cards carry `scriptStatus: "none"`

`data/cards.json` has `scriptStatus: "none"` on all 1,647 collectible cards.
`CardDB.decorate()` prefers that field, so 1,304 text cards with no script are
reported as `none` instead of `manual`.

**Fix:** derive status from card content and script presence; ignore raw
`scriptStatus` from the pinned payload, or strip it during import. Add a test
that every collectible card with text and no script is `manual`.

### 6.2 Coverage is presented as automation

`server/service.js` computes `coverage = scriptedWithText / textCards` and the
admin dashboard labels it "Script coverage" with "text cards automated."
All 248 scripted text cards are `auto`, not verified.

**Fix:** report `coverage` and `verifiedCoverage` separately. Label the first
"script present" and the second "verified." Do not call generated scripts
"automated" in user-facing text.

### 6.3 `store.setScript` discards verification metadata

```js
this.scripts[cardId] = { script, status, updatedAt: new Date().toISOString() };
```

Any `verification`, `seed`, or clause metadata is lost on every admin save.

**Fix:** merge metadata, preserve `verification` unless the script body changes,
and invalidate verification when the script or card text changes.

### 6.4 Existing installations never receive improved seed scripts

`store.ensureSeedFile('scripts.json')` copies the packaged seed only when the
user file is absent. `data-migration.js` copies the legacy writable files,
including `scripts.json`, without merging. A new release with 500 improved
scripts will not upgrade an existing user.

**Fix:** add a seed script version and a backed-up merge that:

- never touches `custom` entries;
- never overwrites a locally modified entry;
- upgrades unmodified `auto`/`partial` entries to newer seed versions;
- records `seed.version` and `seed.origin`;
- writes `backups/scripts-<timestamp>.json` before writing;
- is covered by migration and store tests.

### 6.5 Trigger registry drift

`KNOWN_TRIGGERS` omits `allyAttack`; `summonUnit` accepts an undocumented
`allySummon` alias in its presence check but still dispatches `summonOther`, so
an `allySummon` trigger silently never fires; `fireEvent` is unused;
`EffectRunner.run` duplicates `Game.runScript` and has no callers, so
trigger-level `auto` is only honored by dead code; engine dispatch is a set of
hand-written string literals.

**Fix:** export one event registry and use it in the engine, validator, and
manifest. Add a test that the set of events dispatched by `game.js` equals the
registry. Either delete `fireEvent` or make it the only dispatch path. Remove or
wire `EffectRunner.run`, and define whether trigger-level `auto` is supported.

### 6.6 Unknown target types silently hit all units

`targetOptions` ends with:

```js
default:
  [...allyUnits(), ...enemyUnits()].forEach(addUnit);
```

A typo such as `allDamagedAllyUnits` affects both sides. This is a correctness
and safety bug, not a convenience.

**Fix:** return `[]` and log an error for unknown types. The validator must
reject unknown target types. Migrate any existing script that relies on the
fallback (none should, but verify).

### 6.7 Structural validation is not semantic

`server/script-validation.js` checks shape, counts, and size. It does not check
action types, target types, condition types, required fields, or whether the
trigger is dispatched.

**Fix:** add a semantic lint pass used by the admin save path, the peer content
path, and CI. Unknown action/target/condition names become errors. Unknown
triggers remain warnings only for backward compatibility with custom scripts,
but shipped seed scripts must have zero warnings.

### 6.8 Dead and misleading conditions

- `firstTimeThisRound` has no flag setter.
- `custom` always returns true.
- `daybreak` / `nightfall` are conditions, not trigger events; cards that need
  "Daybreak: ..." or "Nightfall: ..." must be modeled as play/summon triggers
  with those conditions, and that pattern must be documented.
- `levelUp` conditions are read from `script.levelUp.condition` but are not
  validated or tested.

**Fix:** document each condition's real semantics, remove or implement `custom`,
add flag setters, and add tests for every condition.

### 6.9 Stale test/documentation counts

`docs/testing.md` previously said 34 syntax files and 23 tests. At the Phase 1.3
audit the measured state was 46 syntax files and 128 tests; the published 0.3.0
state is 47 files and 195 tests, and the current working tree is 47 files and 215
tests after the Reckless batch. `README.md` and `docs/testing.md` carry the
published-release counts.

**Fix:** update both when Phase 0 lands, and add a check that documentation
counts are generated or explicitly dated.

### 6.10 `autoscript.mjs` is destructive

It reads `data/scripts.json`, preserves only `curated` and `custom`, regenerates
all `auto` entries, drops stale entries, and writes in place.

**Fix:** add `--check`, `--out <file>`, and `--only <ids...>` modes. Never make
the default mode destructive. Add a snapshot test for a small fixture set.

---

## 7. Roadmap

The phases are ordered by dependency, not by card count. Do not start Phase 2
until Phase 0's exit gate passes; otherwise every batch will fight the same
infrastructure problems.

### Phase 0 — Trustworthy measurement and safe delivery

Goal: make coverage, verification, upgrades, and validation honest before
authoring 1,300 scripts.

#### 0.1 Status and reporting

- [x] Derive `none` / `manual` / `auto` / `partial` / `curated` / `custom` from
      card text and script presence, not the pinned `scriptStatus` field.
- [x] Add `verified` and `unverified` counts to `CardDB.stats()` and the admin
      stats payload.
- [x] Rename the dashboard metric to "Scripts present" and add a separate
      "Verified effects" metric.
- [x] Add a test: 95 text-less collectible cards are `none`; 1,304 text cards
      without scripts are `manual`; 248 generated scripts are `auto`.
- [x] Assert that `curated` entries have `verification.test` and a matching
      test (fail CI if not).

#### 0.2 Read-only coverage report

- [x] Create `scripts/coverage-report.mjs`.
- [x] Outputs: total/text/none/manual/auto/partial/curated, verified coverage,
      missing by set/type/region, starter-deck cohort, trigger/action frequency,
      and a plain list of missing card IDs with text.
- [x] Supports `--json`, `--markdown`, `--set`, `--type`, `--starter`, and
      `--missing`.
- [x] Never writes `data/scripts.json`.
- [x] Add `npm run scripts:coverage`.

#### 0.3 Verification metadata and preservation

- [x] Define the metadata schema from [Section 3](#verification-metadata).
- [x] Extend `store.setScript` to merge metadata and invalidate verification
      when the script body or card text hash changes.
- [x] Extend the admin script API to accept and return `verification`.
- [x] Strip `verification` and `seed` from peer-supplied scripts; force
      peer scripts to `custom`.
- [x] Add tests for preservation, invalidation, and peer stripping.

#### 0.4 Event and target registry

- [x] Create a single source for trigger names, action types, target types, and
      condition types (for example `shared/script-vocabulary.js`).
- [x] Export `KNOWN_TRIGGERS` from that source; keep `shared/manifest.js`
      compatible.
- [x] Add `allyAttack`.
- [x] Replace hand-written event strings in `game.js` with registry constants.
- [x] Delete `fireEvent` or route every dispatch through it.
- [x] Delete `EffectRunner.run` or make it the live path; do not keep two
      trigger runners with different `auto` behavior.
- [x] Add a parity test: dispatched events === registered triggers; implemented
      actions === declared actions; implemented targets === declared targets;
      implemented conditions === declared conditions.
- [x] Change unknown target resolution to return no options and log an error.

#### 0.5 Semantic validation

- [x] Add `server/script-lint.js` (or extend `script-validation.js`) with:
      action type, target type, condition type, required fields, unknown
      trigger, empty trigger, unreachable condition, and duplicate event checks.
- [x] Use it in admin save, peer content sanitization, and CI.
- [x] Seed scripts must pass with zero warnings.
- [x] Add tests for each rejection class.

#### 0.6 Safe seed upgrade

- [x] Add `seedVersion` / `scriptsVersion` to the packaged seed.
- [x] Implement backed-up merge in `store.init()` and `data-migration.js`.
- [x] Preserve `custom` and locally modified entries.
- [x] Remove entries for cards absent from the pinned seed catalog (for example
      custom-card IDs) from the packaged seed, but never from user data.
- [x] Record merge results in a report and in `.migration.json` or a new
      `scripts-upgrade.json`.
- [x] Add tests: fresh install, existing old seed, user-customized entry,
      locally modified auto entry, corrupt user file, downgrade.
- [x] Document recovery from `backups/` in [docs/backups.md](docs/backups.md).

#### 0.7 Safe authoring tooling

- [x] Add `scripts/batches/<batch-id>.json` merge tooling:
      `npm run scripts:apply -- scripts/batches/<batch-id>.json`.
- [x] Apply validates, sorts keys deterministically, writes atomically, and
      refuses to overwrite a `custom` entry.
- [x] Add `autoscript --check`, `--out`, and `--only`; default remains read-only.
- [x] Add a fixture test for the merge tool.

#### 0.8 DSL documentation

- [x] Create `docs/effect-dsl.md` containing:
      trigger list and dispatch timing, action list and fields, target list and
      choice/auto behavior, condition list and semantics, control flow,
      duration values, target-count behavior, examples, and limitations.
- [x] Link it from the admin Script workshop (copy only, no redesign).
- [x] State clearly that `validateScript` is shape validation and that semantic
      lint is separate.

**Phase 0 exit gate**

- `npm run test:all` passes.
- Coverage report shows 1,304 `manual`, 95 `none`, 248 `auto`, 0 `curated`.
- Admin shows both "scripts present" (16.0%) and "verified" (0%).
- A simulated existing user with an old `scripts.json` upgrades with a backup
  and keeps all `custom` entries.
- Seed scripts pass semantic lint with zero warnings.
- Registry parity test passes.
- No unknown target can resolve to all units.

---

### Phase 1 — Events, state, and reusable primitives

Goal: add the event and state model needed by the largest missing mechanic
families. Do not implement card-specific hacks here.

#### 1.1 Central event emission

- [x] Route dispatches through one ordered event queue.
- [x] Order simultaneous triggers deterministically: active player first, then
      seat order; log the order.
- [x] Prevent recursive event storms with an explicit guard and a clear log.
- [x] Ensure a trigger that kills its source stops remaining queued actions
      according to the chosen policy, and document that policy.
- [x] Add tests for ordering, simultaneous deaths, and recursion.

#### 1.2 New events required by the backlog

Add only events that a real cohort needs, in this order. Implemented events
have a registry entry, dispatch site, and deterministic test.

- [x] `support` / `supported` — a Support attacker is linked to an attacker; both sides receive an event.
- [x] `block` — an attacker/blocker pair is declared; dispatched to both.
- [x] `damageUnit` — unit took damage; `amount`, `eventSource`, `lethal`, and damage flags.
- [x] `damageNexus` — Nexus took damage; `nexus`, `amount`, `eventSource`.
- [x] `heal` — unit or Nexus was actually healed; `amount`, `eventSource`, `healer`.
- [x] `targeted` — a spell targets a unit; target history is recorded before the action.
- [x] `discard` — card discarded; `card`, `player`, `random`, `reason`, `eventSource`.
- [x] `playCard` — non-spell unit, landmark, equipment, and champion-duplicate play.
- [x] `spellCast` — canonical friendly spell-cast event; `castSpell` is an alias.
- [x] `equip` — equipment attached; `equipped`, `equipment`, `player`.
- [x] `detach` — equipment removed; `equipped`, `equipment`, `cards`, `reason`.
- [x] `countdown` — landmark countdown advanced; `landmark`, `countdown`, `destroyed`.
- [x] `spellKill` — a spell source killed a non-landmark unit; `dead`, `spell`, `killer`.
- [x] `behold` — implemented as a condition over hand and board cards, not an event.
- [x] `reputation` — implemented as a condition over damage dealt to the enemy Nexus.
- [x] `flow` — implemented as a static keyword condition.
- [x] `lurk` — an attacking Lurker sets the team's round flag and dispatches `lurk`.
- [x] `allegiance` — implemented as a top-deck region condition.
- [x] `fated` — implemented as a condition over the Fated keyword/text plus `targeted`.
- [x] `evolve` / `augment` / `hallowed` / `brash` / `formidable` — implemented as
      static keyword conditions; no event is needed for the current cohort.

Every event must be added to the registry, validator, dispatcher, and tests in
the same change. Do not add a registry entry without a dispatch site.

#### 1.3 State required by the backlog

- [x] Per-round counters for cards played, spells cast, units died, damage
      taken/dealt, and first-time flags.
- [x] `firstTimeThisRound` flag setter and reset at round start; add
      `firstTimeThisGame` for once-per-game effects.
- [x] Support marker and combat linkage.
- [x] Block-event attacker context for `sourceWasBlocked`.
- [x] Equipment attachment model and detach rules.
- [x] Landmark countdown state and destruction.
- [x] Reputation, behold, flow, lurk, allegiance, fated, evolve, augment,
      hallowed, brash, and formidable checks.
- [x] Target history for the current resolution and current round.
- [x] Source of damage/heal history with amount and overkill.

#### 1.4 New target primitives

Implement only those proven by a batch:

- [ ] `owner`
- [ ] `topDeck`, `bottomDeck`
- [ ] `deckChoice`
- [ ] `chosenUnit`, `chosenAlly`, `chosenEnemy`
- [ ] `allyEquipment`, `enemyEquipment`
- [x] `allDamagedAllyUnits`, `allDamagedEnemyUnits`
- [x] `allChampionAllies`, `allChampionEnemies`
- [x] `supporter`, `supported` for Support linkage
- [x] `lastTargets`, `lastRecalled`, `eventUnit` for trigger-context effects

For each, add the implementation, registry entry, choice/auto behavior, and
tests. Remove it from `AUTO_TARGETS` until implemented.

#### 1.5 New action primitives

Implement only those proven by a batch:

- [x] `detach` / `destroyEquipment` (attach is still handled by playing an Equipment card)
- [x] `equipFromHand` with ownership and card-cost filtering (Catch!)
- [x] `pickFromTop` filtered selection from the top of the deck (Tempting Prospect)
- [x] `capture` / release lifecycle (Detain)
- [x] `swap` two allied units (Stand United)
- [x] `nextSummon` temporary keyword/stat buff for the next summon (Tattered Banner)
- [x] `addCounter` and counter conditions (Shen)
- [x] `drain` with actual-damage healing (Absorb Soul)
- [x] `reduceCost` with a hand-entry cost modifier (Oblivious Islander)
- [x] `moveCardToTop` (Draven's Biggest Fan)
- [x] Enemy-deck creation through `create { who: "enemy" }` (Pesky Specter)
- [x] Card-pool `excludeIds`, follower alias, and keyword text fallback (Warden's Prey)
- [x] `transform` a unit or a card in hand (Vastayan Disciple / Shimon Wind)
- [ ] `advanceCountdown` / `destroyLandmark`
- [ ] Non-random discard from hand (player choice)
- [ ] Choose from deck with a predicate beyond the top N (`pickFromTop` covers
      the current starter-deck need)
- [ ] `setStats`, `swapStats`
- [ ] `reveal`
- [ ] `predictChoose`
- [ ] `grantAura`
- [ ] `strikeNexus`
- [x] `moveToDeck` (`moveToHand` still uses `recall`)
- [x] Declarative `choose` branches, including nested choices and continuations
      (Tellstones and Vanguard batches; invalid choices are rejected without
      advancing).
- [ ] `increaseMaxMana`, `refillMana`
- [x] `transformCardInHand` (via `transform`)
- [ ] `copyCard`
- [ ] `createInDeck`
- [ ] `obliterateDeck`
- [ ] `silenceAll`, `stunAll`

Do not add an action that only one exotic card needs unless that card is in the
current batch and the primitive is general enough to be named clearly.

#### 1.6 Champion level-up model

- [x] Validate `script.levelUp.condition`.
- [ ] Require every collectible champion with `level2Id` to have a level-up
      condition or an explicit `levelUp: { "condition": { "type": "always" } }`
      if the card truly levels unconditionally. (Enforced for scripts that
      declare `levelUp`; the cohort-wide requirement waits for Phase 3 card work.)
- [x] Ensure level-up swaps card data, keywords, stats, and script atomically.
- [x] Fire the `levelUp` trigger after the swap and before further actions.
- [x] Add a generic level-up regression test; Garen and Shen now have verified
      per-champion level-up tests. The cohort-wide champion sweep remains a
      Phase 3 item.

**Phase 1 exit gate**

- Every new event/action/target/condition has implementation + registry +
  validator + test.
- Event ordering is deterministic and tested.
- `firstTimeThisRound` and all other conditions have a setter or are removed.
- Champion level-up validation rejects champions without a condition.
- Coverage may barely move; capability coverage must be demonstrably larger.

---

### Phase 2 — Starter-deck cohort

Goal: every text card in the six starter decks is verified. This is the first
user-visible milestone and the best regression suite.

Cohort: 206 unique cards, 179 with text, 73 already scripted, **106 missing**,
47 curated. Re-measure before starting; the deck-builder work can change this
cohort.

#### 2.1 Cohort inventory

- [x] Generate `docs/scripts/starter-cohort.md` from the coverage report.
- [x] Group by deck and by mechanic.
- [x] Mark Vanguard blockers by Phase 1 gap; all are resolved in 0.3.0.
- [ ] Clause-by-clause triage for the other five starter decks. Remaining
      blockers are summarized in `docs/scripts/blocked.md`.

#### 2.2 Verify the remaining existing scripts

- [x] Audit all 29 Vanguard Disciplines text cards against printed text and mark
      them `curated` after tests pass.
- [ ] Audit the 26 remaining unverified scripts in other starter decks.
- [ ] Fix `auto` scripts that are approximations. Record the approximation in
      the verification notes. Example: `topDeckRegion` is used as a stand-in for
      Allegiance on three mono-region cards (`01DE001`, `01NX008`, `01SI016`);
      that is correct only while those cards stay mono-region.
- [ ] Remove generator noise such as `count: 1` on `allAllyUnits` targets
      (for example `01DE052`); count is ignored for "all" targets.

#### 2.3 Implement the 106 missing cards

Suggested batch order, one deck at a time:

1. [x] Vanguard Disciplines — 29/29 verified in 0.3.0
2. [ ] Reckless Revenants — 18/31 verified, 12 missing; Draven remains `auto`
3. [ ] Frost & Flame
4. [ ] Tides of the Peak
5. [ ] Sands & Secrets
6. [ ] Runeterra Wanderers

Within a deck, order by mechanic: vanilla + keyword-only, simple play effects,
targeted effects, conditional effects, death/attack triggers, champion
level-ups, then complex multi-clause cards.

The dependency-ordered batch plan is
[`docs/agents/implementation-order.md`](docs/agents/implementation-order.md); the
exhaustive test order is
[`docs/agents/testing-order.md`](docs/agents/testing-order.md); the human-visible
two-client plan is
[`docs/agents/manual-game-testing.md`](docs/agents/manual-game-testing.md). Follow
them unless a measured dependency changes the order; update the plan when it
does.

#### 2.4 Starter-deck acceptance

- [ ] Every text card in the cohort is `curated` or explicitly `blocked` with
      an engine dependency and a tracked issue.
- [ ] Every distinct effect has a regression test.
- [ ] A deterministic smoke test plays each starter deck for several rounds
      with no engine error, no unresolved choice, and no unknown action log.
- [x] `npm run test:all` and a packaged build pass for the Vanguard batch; the
      Reckless batch passes `npm run test:all` (no rebuild under the headless-only
      instruction).

**Phase 2 exit gate**

- 0 `manual` and 0 `auto` cards in the starter cohort.
- 179/179 starter text cards verified or explicitly blocked.
- Coverage impact: at least +106 scripts, approximately 25.0% present and a
  meaningful verified percentage.
- No new engine warnings in a 10-round starter-deck simulation.

---

### Phase 3 — High-reuse mechanics and champions

Goal: reduce the long tail efficiently by implementing effects that recur across
many cards before sweeping by set.

#### 3.1 Frequency mining

- [ ] Extract normalized clauses from all missing card texts.
- [ ] Count recurring phrases: summon/create a token, grant keyword, deal damage,
      draw, discard, recall, strike, support, reputation, behold, plunder,
      nightfall/daybreak, countdown, equip, allegiance.
- [ ] Produce `docs/scripts/mechanic-frequency.md`.
- [ ] Pick the top 10 families that unlock the most cards per engine change.

#### 3.2 Generic effect families

Implement in this order unless data says otherwise:

1. [ ] Token creation and summon variants.
2. [ ] Damage / heal variants: all, random, battling, strongest, weakest, Nexus.
3. [ ] Buff / debuff variants: everywhere, random, strongest, weakest, keywords.
4. [ ] Draw / discard / create / predict / toss variants.
5. [ ] Keyword grant/removal and duration semantics.
6. [ ] Conditional wrappers: `if`, `and`, `or`, counts, regions, board state.
7. [ ] Copy / transform / resurrect / recall variants.
8. [ ] Combat events: attack, block, strike, nexus strike, survive damage.
9. [ ] Spell interaction: cast, target, counter, spell shield, spell mana.
10. [ ] Region mechanics listed in Phase 1.

Each family must ship with a test matrix, not one happy-path test.

#### 3.3 Champions and level-ups

There are 117 collectible champions, 105 with text, 16 scripted, **89 missing**.
Champions are deck-defining and should not wait for set sweeps.

- [ ] Implement all 89 missing champion scripts.
- [ ] Add level-up conditions and level-2 behavior for all 117 champions
      with a `level2Id`.
- [ ] Test the pre-level and post-level state, keywords, stats, and script.
- [ ] Ensure champion spells/skills referenced by `associatedCardRefs` either
      have scripts or are explicitly marked `blocked`.

**Phase 3 exit gate**

- 100% of champions have a verified level-up condition.
- 100% of champion text is `curated` or explicitly `blocked`.
- Top 10 mechanic families are implemented and tested.
- Missing text cards fall below 800 (target: 700 or fewer).
- No engine change is card-specific unless documented as an exception.

---

### Phase 4 — Remaining cards by mechanic

Goal: finish the long tail without turning into an unreviewable set sweep.

- [ ] Work in 8–12-card batches, one mechanic per batch.
- [ ] Prefer cards that reuse Phase 1–3 primitives.
- [ ] Leave exotic, set-specific, and ambiguous cards for last.
- [ ] For each batch: one engine change at most; if more is needed, split the
      batch.
- [ ] Track blocked cards in `docs/scripts/blocked.md` with the missing
      primitive, card IDs, and a proposed engine change.
- [ ] Do not mark a card `curated` without a test that would fail if the script
      were removed.

Suggested order after Phase 3:

1. [ ] Landmarks (81 text, 79 missing): countdown, destruction, ongoing auras.
2. [ ] Equipment (27 text, 25 missing): attach, detach, buffs, death behavior.
3. [ ] Remaining spells with unique targeting.
4. [ ] Remaining units with multi-clause text.
5. [ ] Set-specific mechanics and one-off cards.

**Phase 4 exit gate**

- Missing text cards below 5% of 1,552 (< 78).
- Every remaining missing card is `blocked` with a concrete reason.
- Verified coverage is reported and is the primary release metric.
- No `auto` script remains unverified in a starter deck or champion slot.

---

### Phase 5 — Release hardening

- [ ] Run `npm run test:all` and `npm run build:win`.
- [ ] Test a fresh install and an upgrade from 0.2.0 user data.
- [ ] Verify backup creation and restore instructions.
- [ ] Measure startup with the full script file; compare to the 0.2.0 baseline.
- [ ] Test a 1v1 and a 2v2 game with decks containing newly scripted cards.
- [ ] Test a peer joining with different script hashes; confirm warnings are
      clear and the host remains authoritative.
- [ ] Generate `docs/scripts/coverage-<version>.md` and attach it to release
      notes.
- [ ] Record the SHA-256 of the portable artifact.
- [ ] State verified coverage, not script presence, in the release summary.

---

## 8. Per-card workflow

Follow this loop for every card. Do not skip steps.

1. **Read the canonical card.** Use `data/cards.json`; do not use memory or an
   external wiki. Record `id`, `name`, `type`, `cost`, `text`, `keywords`.
2. **Split the text into clauses.** Each independent sentence or trigger is a
   clause. Reminder text and keyword definitions are not clauses.
3. **Classify the clauses.** For each: event, condition, target, action,
   duration, and whether it is optional ("you may").
4. **Check engine capability.** If a clause needs an unimplemented event,
   target, condition, or action, stop and either add it in a separate
   engine-change batch or mark the card `blocked`.
5. **Write the script.** Use the smallest set of triggers and actions. Avoid
   `custom`, unknown targets, and silent fallbacks.
6. **Add a regression test.** Build a deterministic game state, put the card
   into play, trigger the event, and assert the exact resulting stats, keywords,
   board, hand, deck, or Nexus health.
7. **Run semantic lint.** Zero errors and zero warnings for a seed script.
8. **Run the test suite.** `npm run test:all`.
9. **Update the batch file and coverage report.**
10. **Mark verification metadata.** Include the test name and clause list.
11. **Review the diff.** Only the batch's cards, tests, and necessary engine
    changes should appear.

### Batch file format

```json
{
  "batch": "2026-10-27-support-01",
  "cards": {
    "01DE052": {
      "status": "curated",
      "script": { "triggers": [] },
      "verification": {
        "version": 1,
        "cardTextHash": "...",
        "verifiedAt": "2026-10-27T00:00:00.000Z",
        "verifiedBy": "agent",
        "test": "test/engine.test.mjs#brightsteel-formation",
        "clauses": ["..."],
        "notes": ""
      }
    }
  }
}
```

Use the merge tool. Do not hand-rewrite the 122 KB `data/scripts.json` for every
batch.

---

## 9. Testing contract

### What must be tested

- Every new engine action.
- Every new target type (choice and auto behavior).
- Every new condition (true and false cases).
- Every new event (dispatch timing, ordering, and no-op when absent).
- Every `curated` card, one test per clause.
- Every champion level-up (before and after).
- Seed merge, metadata preservation, and peer stripping.
- Registry parity.
- Coverage report determinism.

### REA evidence policy

REA is reserved for claims that cannot be established from this source tree:
shipped-artifact behavior, runtime-only state, decompilation, or comparison
with behavior not established by available source. Phase 0 is a source-and-test
change; no REA MCP server is registered, and no runtime evidence was required.
When a later batch needs runtime proof, capture it with REA and link the
Evidence ID in the batch ledger. Reference:
<https://github.com/morluto/rea>.

### Test style

Use the existing fixture pattern in `test/engine.test.mjs`:

```js
const cards = [card('T01', 'Recruit', { attack: 1, health: 1 })];
const scripts = {
  T08: { status: 'curated', triggers: [{ on: 'play', actions: [{ type: 'damage', amount: 2, target: 'enemyUnit' }] }] },
};
const db = new CardDB({ riotPayload: { cards, globals: {} }, scripts, settings: {} });
const g = new Game({ mode: '1v1', players, decks, cardDB: db, seed: 42 });
```

Rules:

- Fixed seed (`42` or a per-test seed).
- No network.
- No `Date.now()` assertions.
- No art.
- Prefer direct state assertions over logs.
- Each test name names the card and clause, for example
  `Brightsteel Formation: summon grants Barrier to all allies`.
- Use `assert.equal` for exact values; use `assert.ok` only for existence.

### What does not count as a test

- A syntax check.
- A snapshot of the script JSON.
- "The game did not crash."
- A test that only asserts a script exists.
- A test that passes when the script is removed.

---

## 10. Commands

| Command | Purpose |
| --- | --- |
| `npm run check:syntax` | Syntax check; currently 47 files |
| `npm test` | Node test runner; currently 215 tests |
| `npm run test:all` | Syntax + seed lint + tests; required before every batch commit |
| `npm run scripts:coverage` | Read-only coverage report; supports `--json`, `--markdown`, `--set`, `--type`, `--starter`, `--missing`, `--out` |
| `npm run scripts:lint` | Semantic lint of the packaged seed; zero warnings required |
| `npm run scripts:apply -- <batch.json>` | Validated batch merge with backup and atomic write |
| `npm run autoscript -- --check` | Read-only generation check |
| `npm run build:win` | Portable Windows x64 build; runs `test:all` first |
| `npm run desktop` | Electron desktop app |
| `npm start` | Local server |
| `npm run migrate:data` | Legacy data migration |

Do not run the build to validate a script batch. Build only at a phase gate or
release gate.

---

## 11. Tooling safety

### `scripts/autoscript.mjs`

Phase 0 made the generator non-destructive by default:

- Reads `data/cards.json` and `data/scripts.json`.
- Preserves `curated`, `custom`, `partial`, and `manual` entries.
- Regenerates only `auto` entries.
- Does not create entries for cards it cannot translate.
- Keeps entries for cards outside `--only`; stale auto entries are deleted only
  when they are in scope.
- Default mode is read-only. `--check` reports drift and exits non-zero;
  `--out <file>` writes a copy; `--only <ids...>` limits the run.
- `--write` is explicit and creates a backup before replacing the real file.

Therefore:

- Prefer `npm run autoscript -- --check` or `--out` first.
- Never treat generated output as `curated`.
- A `--write` run still needs review and `npm run scripts:lint`.

### `data/scripts.json` size

At 288 entries the file is about 171 KB. A complete file could approach
0.8–1.2 MB. `MAX_SCRIPT_BYTES` is per script (64 KB), not per file, so this is
acceptable, but:

- Measure startup time at 500, 1,000, and 1,500 entries.
- Keep JSON formatting stable and sorted by card ID for reviewable diffs.
- If startup regresses, split by set in a separate migration; do not do it
  preemptively.

### Peer content

`server/content.js` sanitizes peer scripts through `validateScript`. Peer
scripts must:

- remain declarative;
- stay under the size limits;
- be forced to `custom`;
- never carry verification metadata;
- never be presented as host-verified.

---

## 12. Prioritization

Use this order unless data proves otherwise:

1. **Starter-deck text cards** (106 missing). User-visible, bounded, and a
   broad regression suite.
2. **Engine primitives reused by 10+ cards.** One change unlocks many cards.
3. **Champions and level-ups** (89 missing text champions; 117 collectible
   champions with a `level2Id`). Deck-defining and highly visible.
4. **Mechanic families with the highest missing-card count.**
5. **Landmarks and equipment.** High engine cost, smaller counts.
6. **Exotic and set-specific cards.** Last.

Do not prioritize by set number alone. Set5 has the most missing cards, but many
of them may share primitives with Set1/Set4; implement the primitive once.

### Triage labels

- `ready` — expressible with today's DSL; write the script and test.
- `engine` — needs an event/target/condition/action; schedule an engine batch.
- `ambiguous` — printed text unclear or contradictory; ask, do not guess.
- `blocked` — depends on a mechanic outside the current milestone.
- `verified` — script + test + metadata complete.

---

## 13. Progress ledger

Update this table after every phase gate. Counts are current as of 2026-10-27.

| Phase | Scope | Exit metric | Status |
| --- | --- | --- | --- |
| 0 | Integrity, status, seed upgrade, registry, lint, docs | Honest metrics; safe upgrade; parity test | **Complete 2026-10-27** |
| 1 | Events, state, primitives, level-up model | All new vocabulary implemented + tested | In progress — 1.1–1.3 complete; Vanguard- and Reckless-required 1.4–1.6 primitives complete 2026-10-27; broader model open |
| 2 | Starter decks | 179/179 text cards verified or blocked | In progress — Vanguard 29/29; Reckless 18/31 verified; 47/179 verified, 106 without scripts overall; remaining decks open |
| 3 | Reuse families + champions | 89 champions + top 10 families; < 800 missing | Not started |
| 4 | Remaining cards | < 78 missing; rest blocked with reasons | Not started |
| 5 | Release hardening | Fresh + upgrade installs; coverage report | In progress — 0.3.0 build, packaged smoke, coverage report, and checksum recorded; cross-network and upgrade gates open |

### Phase 0 evidence (2026-10-27)

- `npm run check:syntax`: 46 files, syntax OK.
- `npm test`: 91 passing, 0 failing.
- `npm run scripts:lint`: 249 entries, 0 errors, 0 warnings.
- `npm run scripts:coverage -- --json`: 1,647 collectible; 1,552 text;
  248 present (16.0%); 0 verified; 95 `none`; 1,304 `manual`; 248 `auto`;
  0 `partial`; 0 `curated`; 1,304 missing.
- Seed upgrade tests cover fresh install, old seed upgrade, custom and curated
  preservation, locally modified `auto`, corrupt user file, newer-user-version
  downgrade protection, and non-pinned seed exclusion.
- Registry parity tests cover events, actions, targets, and conditions.
- Unknown targets return no options and log an error; they never hit all units.
- Peer content tests force `custom` and strip `verification`/`seed`.
- Admin script API tests accept and return verification metadata.
- `npm run build:seed`: 248 pinned entries; excluded 1 non-pinned local entry
  (`C343DC2`). The packaged seed contains no `custom` entry.
- `npm run autoscript -- --check` is read-only and currently reports 8 legacy
  `auto` entries that the current parser would drop: `01DE024`, `01DE053`,
  `01FR021`, `01IO041`, `01NX050`, `01PZ016`, `01SI026`, `02BW014`. No
  `--write` was run; they remain in local data for manual review. This check is
  not part of `test:all`, and the exit code is expected to be 1 until those
  entries are reviewed.
- `docs/effect-dsl.md` documents the implemented surface and current limits.
- No runtime REA evidence was captured for Phase 0: the claims are established
  by the source tree and deterministic tests, and no REA MCP tools are
  registered. Runtime/shipped-artifact evidence remains a Phase 1/2 option when
  a claim cannot be settled from source.

### Phase 1.1 evidence (2026-10-27)

- `server/engine/game.js` now owns `eventQueue`, `emitEvents()`, `runScript()`,
  `deferEvents()`, and `emitDeaths()`. `EffectRunner.pump()` drains the FIFO
  event queue only after the LIFO resolution stack is empty.
- Simultaneous batches are sorted by active team, seat, semantic phase, board
  position, unit creation order, and emission order. Batches with more than one
  trigger log `Event order (… active first, then seat): …`.
- Multiple triggers on one script resolve in declared order.
- `damageAll`, multi-target `damage`/`kill`, and combat exchanges queue deaths
  before resolving Last Breath effects. The dying unit's own death trigger
  resolves before watchers from the same seat.
- The storm guard logs `Event storm guard: dropped …` after 500 event batches
  in one pump (configurable through `settings.events.maxPerPump`) and clears the
  remaining queue. The queue cap is 500 batches (`settings.events.maxQueue`).
- Source-death policy: a queued trigger still resolves if its source leaves play
  before it starts. If the source dies during its own trigger, remaining actions
  stop with an `event` log; `death` triggers are exempt. Documented in
  `docs/effect-dsl.md`.
- `test/events.test.mjs` adds 8 deterministic tests: active-team ordering,
  `beginRound` dispatch, 2v2 seat order, declared trigger order, simultaneous
  death batching, board-wipe death batching, storm guard, and source-death stop.
- `npm run check:syntax`: 46 files, syntax OK.
- `npm test`: 99 passing, 0 failing.
- `npm run scripts:lint`: 249 entries, 0 errors, 0 warnings.
- `npm run scripts:coverage -- --json`: unchanged at 248 present (16.0%),
  0 verified, 1,304 missing. Phase 1.1 is engine capability, not card coverage.
- No runtime REA evidence was required: ordering, death batching, storm guard,
  and source-death behavior are established by source and deterministic tests.

### Phase 1.2 evidence (2026-10-27, partial)

- Implemented `block`, `damageUnit`, `damageNexus`, `heal`, `discard`,
  `playCard`, `spellCast` (with `castSpell` alias), `equip`, and `countdown`.
  Each has a registry entry, a live dispatch site, and deterministic tests.
- `damageUnit` prepares damage watchers before death processing, marks a lethal
  target dead, then queues damage before death watchers. `damageNexus` and
  `heal` expose the damaged/healed target and amount. `discard` dispatches the
  discarded card's own script plus on-board watchers with `random` and `reason`.
- `playCard` fires for non-spell units, landmarks, equipment, and champion
  duplicates; spells use `spellCast` instead. Equipment play now also runs the
  equipment card's own `play` trigger and dispatches `equip`.
- `countdown` advances as one round-start batch and is queued before a
  zero-countdown landmark is destroyed.
- Event context now keeps `source` as the resolving trigger's source and exposes
  the cause as `eventSource`. This fixes watcher `self` targets while retaining
  damage/heal/discard cause information.
- `test/events-dispatch.test.mjs` adds 11 tests covering dispatch, ordering
  before death watchers, non-lethal damage, Nexus heal, discard context,
  `playCard` versus spells, the `castSpell` alias, attacker/blocker context,
  equipment context, and countdown context. `test/script-lint.test.mjs` adds an
  alias double-fire warning test.
- Deferred with reasons: `support` (needs support marker/linkage), `targeted`
  and `fated` (need target history), `detach` (needs equipment detach model),
  `behold` (starter cards use a condition), `reputation`, `flow`, `lurk`,
  `allegiance`, and keyword-state events (need Phase 1.3 state).
- `npm run check:syntax`: 46 files, syntax OK.
- `npm test`: 111 passing, 0 failing.
- `npm run scripts:lint`: 249 entries, 0 errors, 0 warnings.
- `npm run scripts:coverage -- --json`: unchanged at 248 present (16.0%),
  0 verified, 1,304 missing. This is engine capability, not card coverage.
- No runtime REA evidence was required: dispatch timing, context, and ordering
  are established by source and deterministic tests.

### Phase 1.3 evidence (2026-10-27)

- State: teams track `damageTakenThisRound`, `damageDealtThisRound`, and
  `lurkActiveThisRound`; players track `roundFlags`, `gameFlags`,
  `cardsDrawnThisRound`, `maxCardsDrawnInRound`, and `equipsThisGame`.
  `beginRound` resets round flags and round counters before the draw.
- First-time conditions: `firstTimeThisRound` consumes a per-round flag and
  resets at round start; `firstTimeThisGame` consumes a per-game flag. Lint no
  longer warns on either.
- Equipment: playing an Equipment stores an attachment with its card, attack,
  health, and canonical keywords. `power`, `maxHealth`, `hasKeyword`, and
  keyword stacks read the attachment list, so detaching cleanly removes the
  bonuses. `detachEquipment()` emits `detach`; `destroyEquipment` discards the
  equipment, while plain `detach` returns it to hand. A dead unit's equipment
  still returns to hand.
- Support: `attack()` accepts an optional `supports` map. Without it, each
  Support attacker supports another attacker or itself. The engine dispatches
  `support` to the supporter and `supported` to the supported ally after attack
  events and before blockers. Targets `supporter` and `supported` expose the
  pair; `combat.supports` records the links.
- Block context: each `block` trigger receives a pair-specific combat view with
  `attacker`, `blocker`, and `target: blocker`, so `target: blocker` resolves.
- Lurk: an attacking Lurker sets the team's `lurkActiveThisRound` flag and
  dispatches `lurk` to allied watchers. `lurkActive` is a condition.
- Conditions and history: added `cardsPlayedThisRound`, `cardsDrawnThisRound`,
  `cardsDrawnInARoundThisGame`, `damageTakenThisRound`, `damageDealtThisRound`,
  `equipsThisGame`, `sourceEquipped`, `attackerEquipped`, `behold`,
  `healWasDamaged`, `reputation`, `allegiance`, `fated`, `flow`, `evolve`,
  `augment`, `hallowed`, `brash`, and `formidable`. `damageHistory` and
  `healHistory` record amount, overkill/overheal, source, and lethal state;
  `targetHistory` records spell targets, and `targeted` dispatches before the
  spell action resolves.
- Targets/actions: added `allDamagedAllyUnits`, `allDamagedEnemyUnits`,
  `allChampionAllies`, `allChampionEnemies`, `supporter`, and `supported`; added
  `destroyEquipment`, `detach`, and `moveToDeck`.
- Champion level-up: `checkLevelUps()` swaps the level-2 card, stats, keywords,
  and script atomically, then fires `levelUp`. A generic test covers the swap;
  cohort-wide mandatory conditions remain a Phase 3 item.
- `test/state-phase13.test.mjs` adds 16 deterministic tests covering flags,
  support, equipment/detach, equipped conditions, Behold, heal context, Lurk,
  `moveToDeck`, block targets, counters, static keyword conditions, history,
  spell targeting/Fated, level-up, and the new target primitives.
- `npm run check:syntax`: 46 files, syntax OK.
- `npm test`: 128 passing, 0 failing.
- `npm run scripts:lint`: 249 entries, 0 errors, 0 warnings.
- `npm run scripts:coverage -- --json`: unchanged at 248 present (16.0%),
  0 verified, 1,304 missing. Phase 1.3 is engine capability, not card coverage.
- No runtime REA evidence was required: the state model and dispatch sites are
  established by source and deterministic tests.

### 0.3.0 Vanguard batch evidence (2026-10-27)

- Applied `scripts/batches/2026-10-27-vanguard-batch-01.json` with 19 curated
  entries: 14 collectible Vanguard Disciplines text cards plus 5 generated or
  level-2 cards (`01DE012T1`, `01IO032T1`, `04DE007T1`, `06IO013T1`,
  `06IO014T1`).
- Added engine support for `equipFromHand`, `pickFromTop`, `capture`, `swap`,
  `nextSummon`, `addCounter`, unit/hand `transform`, hand-card keyword grants,
  equipment-from-hand selection, `barrier`/`recall`/`support` dispatch, and the
  `eventTeam`, `eventNotSource`, `lastTargetFollower`, `eventCard`,
  `selfStrikesThisGame`, and `counter` conditions.
- Vanguard Disciplines is complete: 29/29 text cards verified, 0 missing, 0
  partial. All 29 print clauses have regression coverage in
  `test/vanguard-batch.test.mjs`; the file contains 28 tests including Catch!
  empty-hand/illegal-equipment cases, Silence and Suppress no-equipment and
  champion cases, Steadfast Elkin multiple-copy/enemy-equip/repeat-equip cases,
  and Shen's below-threshold and self-Barrier cases.
- Fixed `rally()` to clear the opposing team's attack token.
- `npm run check:syntax`: 47 files, syntax OK.
- `npm test`: 195 passing, 0 failing.
- `npm run scripts:lint`: 276 entries, 0 errors, 0 warnings.
- Coverage: 270 scripts present (17.4% of 1,552 text cards), 38 verified (2.4%),
  1,282 missing. Starter cohort: 61 scripted, 29 verified, 118 missing.
- `npm run build:win` produced `release/NexusForge-0.3.0-portable.exe`
  (121,460,358 bytes; SHA-256
  `3E9EAD7832C7ABE9CB61E2B9CA914447966290030609C8169E4904AD79798C9A`) after the
  protocol/app version bump to 0.3.0. An earlier 0.3.0 packaged build launched
  with fresh data, installed 275 seed scripts (43 curated entries including five
  generated/level-2 scripts), served 1,647 cards at version 0.3.0 with
  `desktop: true`, and closed without leaving processes or listening ports. This
  smoke evidence was recorded before the headless-only instruction. After the
  final Steadfast Elkin seed-scope correction and batch metadata update, the
  executable was rebuilt and the hash above recorded; it was not relaunched, so
  the smoke evidence does not cover the exact final hash.
- External-network, relay/TURN, clean-machine, 2v2, spectator, and reconnect
  verification remain open. The user-reported mulligan stall remains under
  investigation and is not claimed fixed.

### Post-0.3.0 Reckless Revenants batch 1 evidence (2026-10-27)

- Applied `scripts/batches/2026-10-27-reckless-revenants-01.json` with 18
  curated collectible entries. This batch contains no generated or level-2
  entries.
- Reckless Revenants is now 19/31 scripted, 18/31 verified, and 12 missing.
  `01NX020` Draven remains `auto` and unverified; its level-up, `01NX020T3`, and
  the other 12 deck cards are listed in `docs/scripts/blocked.md`.
- Added the primitives the batch proved: `drain` (heals for actual damage),
  `reduceCost` with a hand-entry `costModifier`, `moveCardToTop`, the
  `spellKill` event with a landmark guard, the `sourceWasBlocked` condition,
  enemy-deck creation through `create { who: "enemy" }`, and card-pool filters
  `excludeIds`, `type: "follower"`, and keyword text fallback. `playCard`, hand
  views, and `playable` now use the modified hand cost.
- `test/reckless-revenants.test.mjs` adds 20 deterministic tests, including
  Barrier/Tough/overkill drain, Islander with no unit in hand, and landmark
  spell-kill exclusion.
- `npm run check:syntax`: 47 files, syntax OK.
- `npm test`: 215 passing, 0 failing.
- `npm run scripts:lint`: 288 entries, 0 errors, 0 warnings.
- Coverage: 282 scripts present (18.2% of 1,552 text cards), 56 verified (3.6%),
  1,270 missing. Starter cohort: 73 scripted, 47 verified, 106 missing.
- No v0.2.0/v0.3.0 tag or artifact was changed. The published 0.3.0 artifact
  still carries its original seed (270 present, 38 verified), not this
  post-release batch.
- External-network, relay/TURN, clean-machine, full 1v1, 2v2, spectator,
  reconnect, and mulligan-stall gates remain open.

### Batch ledger template

```markdown
### Batch <YYYY-MM-DD>-<mechanic>-<nn>

- Cards: `<id>` `<name>`; ...
- Engine changes: ...
- Tests added: ...
- Coverage delta: present +N, verified +N
- Blocked: ...
- Reviewer: ...
- Notes: ...
```

Keep the ledger in `docs/scripts/batches/` once that directory exists. Until
then, append to this section.

---

## 14. Authoring patterns

### Simple play effect

```json
{
  "status": "curated",
  "script": {
    "triggers": [
      {
        "on": "play",
        "actions": [
          { "type": "damage", "amount": 2, "target": { "type": "enemyUnit" } }
        ]
      }
    ]
  }
}
```

`enemyUnit` prompts the controller for a target when played from hand. During
automatic triggers, `autoTargetIds` picks a legal target.

### Self buff on summon

```json
{
  "triggers": [
    {
      "on": "summon",
      "actions": [
        { "type": "buff", "power": 1, "health": 1, "target": { "type": "self" } }
      ]
    }
  ]
}
```

`target` accepts a string or an object. Prefer the object form in new scripts
for clarity and future filter fields.

### Conditional play effect

```json
{
  "triggers": [
    {
      "on": "play",
      "condition": { "type": "allyCount", "op": ">=", "value": 3 },
      "actions": [
        { "type": "draw", "amount": 1 }
      ]
    }
  ]
}
```

The condition is evaluated before the trigger's actions. If false, the trigger
does nothing. The card is still played.

### Summon watchers versus the summoned unit

- `summon` fires on the unit being summoned.
- `summonOther` fires on other friendly units.
- `enemySummon` fires on enemy units.

Do not use `play` for "When I'm summoned." A unit played from hand fires both
`play` and `summon`; choose the event that matches the printed wording.

### Death trigger

```json
{
  "triggers": [
    {
      "on": "death",
      "actions": [
        { "type": "draw", "amount": 1 }
      ]
    }
  ]
}
```

`death` is the dying unit's own Last Breath. `allyDeath` and `enemyDeath` are
watchers. Do not duplicate both unless the text says both.

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
          { "type": "grantKeyword", "keyword": "Fearsome", "target": { "type": "self" } }
        ]
      }
    ]
  }
}
```

The engine checks `script.levelUp.condition` during `checkLevelUps()`, swaps the
unit to its `level2Id` card, then fires the `levelUp` trigger. Both the
condition and the trigger must match the printed text.

### Common mistakes

| Mistake | Consequence | Prevention |
| --- | --- | --- |
| Using an unknown target type | No targets; effect logs an error and does nothing | Semantic lint rejects it |
| Using an unknown action type | Logs an error and does nothing | Semantic lint rejects it |
| Using `custom` condition | Always true | Lint rejects it |
| Using `count` with `allAllyUnits` | Count is ignored; all allies are hit | Use `allyUnit` for one, `allAllyUnits` for all |
| Using `play` for "When I'm summoned" | Fires on hand cast and may miss token summons | Use `summon` |
| Duplicating `death` and `allyDeath` | Double trigger | Read the text carefully |
| Assuming `auto` means correct | False coverage | Verify and mark `curated` |
| Editing `data/scripts.json` by hand for a large batch | Unreviewable diff | Use the batch merge tool |
| Running `autoscript` in place | Drops manual entries and regenerates auto | Use `--out`/`--check` |

---

## 15. Open questions

Resolve these before or during Phase 0. Record the decision and date here.

1. Should `manual` mean "text card with no script" or "card played only through
   tabletop tools"? Recommendation: the former, because every text card is
   playable through tabletop tools anyway.
2. Should `auto` entries be shipped at all once semantic lint exists, or should
   they be treated as drafts that never enter a release? Recommendation: ship
   only if they pass lint and are marked `auto`; never include them in the
   verified count.
3. Should verification metadata live inside `scripts.json` or in a separate
   `data/script-verification.json`? Recommendation: inside each entry, because
   it travels with the script and is invalidated naturally.
4. Should peer scripts ever be marked `curated`? Recommendation: no. Peer
   scripts are always `custom`.
5. Should `scripts.json` be split by set? Recommendation: not until measured
   startup or diff size requires it.
6. Should `fireEvent` become the single dispatch path? Recommendation: yes if
   it can preserve current ordering; otherwise delete it and use constants.
7. What is the policy when a card's Text hash changes after verification?
   Recommendation: downgrade to `partial`, keep the script, require re-review.

### Phase 0 decisions (2026-10-27)

| Question | Decision |
| --- | --- |
| Meaning of `manual` | A text card with no script. Playability through tabletop tools is not a status. |
| Shipping `auto` entries | Ship only after semantic lint passes. They remain unverified and never count as verified. |
| Verification location | Inside each `scripts.json` entry, so it travels with the script and is invalidated naturally. |
| Peer verification | Never. Peer scripts are forced to `custom`; `verification` and `seed` are stripped. |
| Split `scripts.json` by set | Not yet. Revisit only if startup or diff size demands it. |
| Single dispatch path | Delete dead `fireEvent`; use the `EVENTS` registry at explicit dispatch sites. |
| Text-hash mismatch | Downgrade to `partial` in reports and on save; keep the script; require re-review. |
| Trigger-level `auto` | Not supported by `Game.runScript()`; remove it from new scripts. |
| Unknown target | No targets plus an error log; lint rejects it. Never all units. |

### Phase 1.1 decisions (2026-10-27)

| Question | Decision |
| --- | --- |
| Trigger ordering | Active team first, then seat order, semantic phase, board position, creation order, and emission order. Multiple triggers on one script use declared order. |
| Nested events | FIFO. Events emitted during a resolution wait until the current resolution stack is empty. |
| Source death | A queued trigger still resolves if its source leaves play before it starts. If the source dies during its own trigger, remaining actions stop; `death` triggers are exempt. |
| Simultaneous deaths | `damageAll`, multi-target damage/kill, and combat exchanges queue deaths before Last Breath effects. The dying unit's own death trigger resolves before watchers from the same seat. |
| Event budget | 500 batches per top-level pump and 500 queued batches by default. Exceeding the budget logs an error and drops the remaining queue. |
| Auras | Remain a direct continuous recalculation path; they are not queued triggers. |

---

## 16. Reporting rules

When reporting progress, always distinguish:

- **Scripts present:** coverage.
- **Verified effects:** curated + metadata + passing test.
- **Blocked:** text cards with a documented engine dependency.
- **Ambiguous:** text cards awaiting a rules decision.
- **Engine gaps:** missing vocabulary, not card count.

Never say "all cards are implemented" because `data/scripts.json` has entries.
Never say "18% of the game works" because 18.2% is coverage, not correctness.

A release note should look like:

> Card effects: 282 scripts present (18.2% of text cards); 56 verified (3.6%).
> Starter decks: 47/179 text cards verified; Vanguard Disciplines is 29/29 and
> Reckless Revenants is 18/31.
> See `docs/scripts/coverage-0.3.0.md`.

And after Phase 2:

> Card effects: 388 scripts present (25.0%); 179 verified. All starter-deck text
> cards are verified or explicitly blocked.

---

## 17. Change log

| Date | Change |
| --- | --- |
| 2026-10-27 | Initial roadmap after repository audit. Baseline: 1,552 text cards, 248 scripts, 1,304 missing, 0 verified. |
| 2026-10-27 | Phase 0 complete: derived statuses, read-only coverage report, verification metadata, single vocabulary registry, semantic lint, backed-up seed upgrades, safe authoring tools, and `docs/effect-dsl.md`. Measured 248 present (16.0%), 0 verified, 1,304 missing. |
| 2026-10-27 | Phase 1.1 complete: central FIFO event queue, deterministic active-team/seat ordering with order logs, declared trigger order, simultaneous-death batching, source-death policy, and event storm guard. Suite is 99 passing. |
| 2026-10-27 | Phase 1.2 events partial: added block, damageUnit, damageNexus, heal, discard, playCard, spellCast/castSpell alias, equip, and countdown with dispatch sites and tests; separated eventSource from trigger source; deferred state-dependent events to Phase 1.3. Suite is 111 passing. |
| 2026-10-27 | Phase 1.3 state complete: per-round/game flags and counters, support/supported linkage, equipment attachment/detach, pair-specific block context, Lurk dispatch, Behold and keyword conditions, target/damage/heal history, new target primitives, and `moveToDeck`/`destroyEquipment`/`detach`. Suite is 128 passing. |
| 2026-10-27 | Resume audit: previous work had already started Phase 2 and stopped after adding an untested `choose` primitive. Finished both Tellstones creation scripts, rejected forged/excess choices, preserved nested continuations, repaired strict batch lint and stale coverage tests, and corrected public logs leaking hidden hand/choice names. Fixed Trusty Ramhound flags shared across copies; strengthened duration tests. Garen/Shen demoted to partial because level-ups are absent. Current evidence and blockers: `docs/scripts/resume-audit.md`, `docs/scripts/blocked.md`. Phase 1 and Phase 2 exit gates remain open. |
| 2026-10-27 | Vanguard batch 01: applied 19 curated entries (14 collectible Vanguard cards + 5 generated/level-2 cards), added the engine primitives they proved, completed Garen/Shen level-ups, and verified all 29 Vanguard Disciplines text cards. Suite is 195 passing. Coverage is 270 present (17.4%), 38 verified (2.4%), 1,282 missing. |
| 2026-10-27 | 0.3.0 release prep: bumped app/protocol metadata to 0.3.0, rebuilt the portable Windows artifact, recorded packaged fresh-seed smoke evidence, regenerated the starter cohort and coverage reports, and updated README/testing/DSL/release documentation. External-network, relay, clean-machine, 2v2, spectator, reconnect, and mulligan-stall gates remain open. |
| 2026-10-27 | Reckless Revenants batch 01: applied 18 curated entries, added `drain`, `reduceCost`, `moveCardToTop`, the `spellKill` event, `sourceWasBlocked`, enemy-deck `create`, and card-pool filters, and verified 18/31 deck text cards. Suite is 215 passing; coverage is 282 present (18.2%), 56 verified (3.6%), 1,270 missing. The 0.3.0 release artifact is unchanged. |
| 2026-10-27 | Added the ordered execution plans: `docs/agents/implementation-order.md` for the remaining Reckless batches, the 25-card auto audit, the four remaining starter decks, cohort acceptance, and release gates; `docs/agents/testing-order.md` for the per-batch and per-card test matrix; and `docs/agents/manual-game-testing.md` for the reviewable two-client in-game plan covering lobby, mulligan, passing, combat, blocking, spells, round cleanup, lethal, keywords, reconnect, and 2v2. No card data or engine behavior changed. |
