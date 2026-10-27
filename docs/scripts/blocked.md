# Open gameplay dependencies

Audited against the pinned `data/cards.json` on 2026-10-27 after the Reckless
Revenants batch 1. This file tracks concrete engine or authoring dependencies
that are still open. It is not a list of missing scripts. Missing scripts must
not be treated as working effects.

## Vanguard Disciplines — resolved in 0.3.0

All 29 Vanguard Disciplines text cards are scripted, tested, and verified. The
previous blockers are closed:

| Local issue | Card | Resolution |
| --- | --- | --- |
| NF-SCRIPT-001 | `06DE024` Catch! | `equipFromHand` selects an owned equipment costing at most 2 and attaches that exact instance. Tests cover the buff branch, the equip branch, empty hand, over-cost equipment, and non-equipment cards. |
| NF-SCRIPT-002 | `06DE033` Silence and Suppress | `destroyEquipment` targets an equipped unit, then `lastTargetFollower` silences only a follower. Tests cover follower silence, champion exclusion, and no legal equipped target. |
| NF-SCRIPT-003 | `06DE029` Steadfast Elkin | The `equip` watcher uses an allied-team check and `firstTimeThisGame` with `scope: "source"`. Tests cover multiple Elkins, enemy equips, and repeated equips. |
| NF-SCRIPT-004 | `06DE040` Tempting Prospect | `pickFromTop` filters the top four cards, takes one, and returns the rest. Tests verify the pick, the remaining deck, and hidden information. |
| NF-SCRIPT-005 | `06IO014` Vastayan Disciple | Recall-to-hand transform creates `06IO014T1` in hand; Shimon Wind summons the Disciple and draws 1. `continueOnSourceDeath` keeps the transform after the source leaves play. |
| NF-SCRIPT-006 | `09DE031` Jarro Lightfeather | Hand-card keyword grants carry Spirit into play with the correct stats and keyword. |
| NF-SCRIPT-007 | `01DE012` Garen | `selfStrikesThisGame` and the level-up model implement the printed strike-twice condition; the level-two rally clears the opposing attack token. |
| NF-SCRIPT-008 | `01IO032` Shen | Barrier counters, the five-Barrier level-up condition, and the level-two buff are implemented. Tests cover the positive threshold, negative threshold, self-Barrier exclusion, and post-level support. |
| NF-SCRIPT-009 | `01DE032` Prismatic Barrier; `06IO005` Gruesome Theater; `01IO001` Ritual of Renewal | Barrier, health-filtered recall, and heal-then-draw scripts are verified. |
| NF-SCRIPT-010 | `01DE025` Detain; `01IO010` Stand United | Capture releases to the owner's board when the captor leaves play; Stand United swaps the selected allies and grants Barrier. |
| NF-SCRIPT-011 | `01DE035` For Demacia! | The round buff is verified with permanent-stat rollback after the round. |
| NF-SCRIPT-012 | `04DE007T1` Tattered Banner; `06IO013T1` Meditate | Next-summon keyword buffs expire unused at round end; Meditate's temporary health buff rolls back correctly. |

Vanguard has 29 text cards: 29 verified, 0 partial, and 0 without scripts. It
passes the starter-deck script gate for this release.

## Reckless Revenants — batch 1 resolved 2026-10-27

Batch 1 applied 18 curated entries from
`scripts/batches/2026-10-27-reckless-revenants-01.json`. The deck now has 19
scripted text cards (18 verified plus the existing `01NX020` Draven `auto`
entry), 12 missing, and both champions' level-up behavior remains blocked.

| Card | Resolution |
| --- | --- |
| `01NX040` Legion Saboteur | Attack trigger deals 1 to the enemy Nexus. |
| `01NX049` Guile | Play trigger stuns a chosen enemy. |
| `01SI043` Hapless Aristocrat | Last Breath summons a Spiderling. |
| `01SI022` Mark of the Isles | Permanent +2\|+2 and Ephemeral on the chosen ally. |
| `07NX008` Elegant Edge | Plunder condition grants the unit +2\|+0. |
| `01SI026` Warden's Prey | Last Breath uses `createRandom` with `excludeIds`, a follower alias, and keyword text fallback. |
| `01SI045` Absorb Soul | New `drain` action damages the ally and heals the Nexus for the damage actually dealt. Barrier, Tough, and overkill cases are tested. |
| `07NX003` All Out | Base +2\|+0 and a Plunder branch that adds +0\|+1 through `lastTargets`. |
| `02SI006` Barkbeast | First allied death in the game grants +2\|+2; later deaths do not repeat it. |
| `04NX018` Crimson Bloodletter | First other-ally summon deals 1 to that ally and grants +1\|+1. |
| `06NX041` Crimson Pigeon | Support linkage damages the supported ally and grants a round buff. |
| `01NX035` Draven's Biggest Fan | New `moveCardToTop` moves Draven to the top only when he is not in hand or play. |
| `03SI003` Stygian Onlooker | Nightfall is modeled as `cardsPlayedThisRound >= 2`; the buff and Fearsome expire at round end. |
| `06SI037` Shadow Isles Tellstones | Declarative `choose` creates one of three Fleeting spells. |
| `04NX019` Thrashing Snapper | New `sourceWasBlocked` condition grants +3\|+0 when an enemy blocks it. |
| `01SI012` Oblivious Islander | Hand-card Ephemeral grant plus `reduceCost`, with `deferTargets` so it is playable with no unit in hand. |
| `05SI011` Burgeoning Sentinel | New `spellKill` event grants +2\|+1 once per game; landmark destruction does not count. |
| `03SI015` Pesky Specter | Last Breath creates two copies in the enemy deck. |

`test/reckless-revenants.test.mjs` contains 20 regression tests covering these
cards plus the no-target Islander case and the landmark spell-kill exclusion.

## Remaining Reckless Revenants dependencies

| Card | Printed effect | Missing capability |
| --- | --- | --- |
| `01NX020` Draven | Summon or strike creates Spinning Axes; level-up after striking with 2+ total Spinning Axes. | Existing `auto` script is unverified. Level-up needs an equipment-strike counter and total-axe tracking; the level-2 card `01NX020T3` has no script or verified stats. |
| `01SI053` Elise | Attack: Summon an attacking Spiderling. Level-up: Round Start with 3+ other Spiders. | Summons cannot enter combat attacking yet; `01SI053T2` and the Spider aura are missing. |
| `01SI011` Ravenous Butcher | To play me, kill an ally. | No play-cost/additional-cost choice that kills an ally before the unit enters play. |
| `05NX006` Reborn Grenadier | To play, discard 1. When I'm discarded, summon an exact copy of me. | Play-cost discard is missing; an exact-copy summon from the discard event also needs a copy-from-discard primitive. |
| `03SI016` Go Hard | Drain 1 from a unit. Create 2 copies in your deck. Every third time, transform all copies everywhere into Pack Your Bags. | In-deck copy creation, a deck-wide every-third counter, and transform-all-copies across zones. |
| `07SI013` Proliferating Darkwraith | Last Breath: copy the strongest Darkwraith in deck, then double the stats of Darkwraiths in deck. | Deck entries store card IDs only; in-deck stat mutation and an in-deck copy of a specific card are missing. |
| `08SI003` Shackled Ghasts | Last Breath: the next time you revive an ally, create a copy of me in hand. | Delayed next-revive trigger and copy-to-hand. |
| `09NX025` The Arena's Greatest | Landmark countdown I-II: give an ally +2\|+0 this round. III: give an enemy Can't Block. | No landmark countdown effect schedule or per-stage script. |
| `06NX020` The Darkin Ballista | You may spend 8 mana to play me as Naganeka of Zuretta. | Alternate play-as choice, alternate cost, and the `06NX020T1` form. |
| `04SI004` The Wings and The Wave | Play: Play me as First Wave or Last Wind. | Play-as choice and Last Wind play cost; the associated forms are `04SI004T1`, `04SI004T2`, and `04SI014`. |
| `01SI047` Fading Memories | Pick a follower. Create an Ephemeral copy of it in hand. | `copy` only copies units in play; copy-to-hand with Ephemeral is missing. |
| `06SI003` Fireth | When I'm summoned, I Improvise. | Improvise's equipment-pool choice and attach flow are missing. |
| `03NX003` Blade Squire | Last Breath: Reforge. | Reforge fragment tracking and Blade of the Exile creation are missing. |

## Remaining starter-deck dependencies

Across the other four starter decks (Frost & Flame, Tides of the Peak, Sands &
Secrets, Runeterra Wanderers):

- 121 unique text cards.
- 26 scripts present: 25 generated (`auto`) plus `06DE024` Catch!, which is
  shared with Vanguard. None is a new verified card for these four decks.
- 95 unique text cards without scripts.
- 0 verified unique cards beyond those already counted in Vanguard.

Cohort total after the Reckless batch: 179 text cards, 73 scripted, 47 verified,
106 missing. Vanguard is 29/29; Reckless Revenants is 19/31 scripted, 18/31
verified, and 12 missing. No other starter deck has passed the clause-by-clause
triage or the starter-deck phase gate.

The generated per-deck table is
[`docs/scripts/starter-cohort.md`](starter-cohort.md). Coverage is tracked in
[`docs/scripts/coverage-0.3.0.md`](coverage-0.3.0.md); that file now reflects the
current working tree after the Reckless batch, not the published 0.3.0 artifact.

## Wider phase gates

- **Phase 1**: the primitives required by the Vanguard and Reckless batch 1 are
  implemented. The remaining target/action gaps are listed in `AGENTS.md`
  section 1.4–1.5.
- **Phase 2**: Reckless Revenants is in progress and four starter decks remain.
  Deterministic multi-round starter acceptance and the phase release gate are
  still open.
- **Phase 3/4**: the remaining 1,270 text cards, 89 missing champion scripts,
  and the long-tail mechanic families are not started.
- **Champion level-ups**: Garen and Shen are verified. Draven and Elise are
  blocked on the capabilities above, and the cohort-wide requirement for every
  champion with a `level2Id` remains open.
- **Release evidence**: external-network, relay/TURN, clean-machine, full 1v1,
  2v2, spectator, and reconnect verification remain pending. The user-reported
  mulligan stall remains under investigation. None of these are claimed fixed or
  verified by this batch.
