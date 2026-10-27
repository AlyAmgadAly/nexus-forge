# Open gameplay dependencies

Audited against the pinned `data/cards.json` on 2026-10-27 for the 0.3.0
release. This file tracks concrete engine or authoring dependencies that are
still open. It is not a list of missing scripts. Missing scripts must not be
treated as working effects.

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

## Remaining starter-deck dependencies

Across the other five starter decks:

- 150 text cards total.
- 32 scripts present, all unverified.
- 118 text cards without scripts.
- 0 verified unique cards beyond those shared with Vanguard.

No other starter deck has passed the clause-by-clause triage or the
starter-deck phase gate. Per-card blockers for those decks have not yet been
filed; review each deck and record the missing primitive before marking a card
`blocked`.

The generated per-deck table is
[`docs/scripts/starter-cohort.md`](starter-cohort.md). Coverage is tracked in
[`docs/scripts/coverage-0.3.0.md`](coverage-0.3.0.md).

## Wider phase gates

- **Phase 1**: the primitives required by the Vanguard batch are implemented.
  The remaining target/action gaps are listed in `AGENTS.md` section 1.4–1.5.
- **Phase 2**: five starter decks remain, along with deterministic multi-round
  starter acceptance and the phase release gate.
- **Phase 3/4**: the remaining 1,282 text cards, 89 missing champion scripts,
  and the long-tail mechanic families are not started.
- **Champion level-ups**: Garen and Shen are verified. The cohort-wide
  requirement for every champion with a `level2Id` remains open.
- **Release evidence**: external-network, relay/TURN, clean-machine, full 1v1,
  2v2, spectator, and reconnect verification remain pending. The user-reported
  mulligan stall remains under investigation. None of these are claimed fixed or
  verified by this batch.
