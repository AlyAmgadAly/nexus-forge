# Open gameplay dependencies

Audited against the pinned `data/cards.json` on 2026-10-27. These local issue IDs
track concrete follow-up work; they are not GitHub issues. Only the Vanguard
batch and its generated-card dependencies have been reviewed here. Other starter
decks still require review. Missing scripts must not be treated as working effects.

## Vanguard Disciplines

| Local issue | Card | Current state | Dependency and acceptance |
| --- | --- | --- | --- |
| NF-SCRIPT-001 | `06DE024` Catch! | Manual | Branch choice now exists, but selecting an equipment card costing at most 2 from hand and attaching that exact instance does not. Add a general equip-from-hand action with cost/ownership validation; test both printed branches, empty hand, and illegal equipment. |
| NF-SCRIPT-002 | `06DE033` Silence and Suppress | Manual | Needs equipment targeting and a continuation tied to the same unit after destroying its equipment. Test follower silence, champion exclusion, and no equipment. Existing `destroyEquipment` alone is insufficient. |
| NF-SCRIPT-003 | `06DE029` Steadfast Elkin | Manual | Needs an allied equip watcher with per-source first-time state. Source-scoped game flags now exist; equip watcher dispatch still needs an allied-team contract and tests for multiple Elkins, enemy equips, and repeated equips. |
| NF-SCRIPT-004 | `06DE040` Tempting Prospect | Manual | Needs filtered selection from the top four deck cards and correct reinsertion of the remainder, preserving card accounting and hidden information. Generic branch choice does not implement deck choice. |
| NF-SCRIPT-005 | `06IO014` Vastayan Disciple | Manual | Needs recall-to-hand transformation into `06IO014T1` Shimon Wind, rather than transforming the departed board object. Test the resulting hand card and the return summon/draw effect. Shimon Wind is also unscripted. |
| NF-SCRIPT-006 | `09DE031` Jarro Lightfeather | Manual | Needs Spirit granted to a selected ally in hand and its stats/keyword carried into play. A generic hand power buff does not implement Spirit. |
| NF-SCRIPT-007 | `01DE012` Garen | Partial | Summon buff works; printed level-up condition “I've struck twice.” is absent. Add the champion condition, exact level-two data/script behavior, and level-up regression before restoring curated status. |
| NF-SCRIPT-008 | `01IO032` Shen | Partial | Support Barrier works; printed level-up condition “I've seen allies gain Barrier 5 times.” is absent. Add an in-play Barrier counter, level-two behavior, and positive/negative threshold tests before restoring curated status. |

Vanguard currently has 29 text cards: 21 verified, 2 partial, and 6 without scripts.
It has not passed the starter-deck phase gate.

## Generated-card follow-ups

Creation is separate from playing the generated card. Tellstones now create the
chosen Fleeting card correctly; that does not imply every resulting spell works.

| Local issue | Cards | Remaining work |
| --- | --- | --- |
| NF-SCRIPT-009 | `01DE032` Prismatic Barrier; `06IO005` Gruesome Theater; `01IO001` Ritual of Renewal | No scripts. Implement Barrier, health-filtered recall, and heal-then-draw respectively with canonical-clause tests. |
| NF-SCRIPT-010 | `01DE025` Detain; `01IO010` Stand United | No scripts. Capture lifecycle and swapping the selected two allies are missing capabilities; test leave-play/release and combat linkage semantics respectively. |
| NF-SCRIPT-011 | `01DE035` For Demacia! | Auto script exists for the round buff, but has no verification metadata/test. Audit and verify separately. |
| NF-SCRIPT-012 | `04DE007T1` Tattered Banner; `06IO013T1` Meditate | No scripts. Penitent Squire and Wuju Style create these cards, but their subsequent effects are not automated. Banner needs a next-ally-this-round watcher; Meditate needs the printed temporary health buff. |

## Wider phase gates

- Across all six starters: 179 text cards, 55 scripts present, 21 verified, and
  124 without scripts. The remaining existing scripts are unverified or partial.
- No shipped champion script currently has a level-up block. Generic engine
  support passing tests does not mean champion cards have been implemented.
- Phase 1 still has target/action gaps listed in `AGENTS.md`. Phase 2 still needs
  the other decks, generated-card follow-ups, deterministic multi-round starter
  acceptance, and its release gate. No executable was rebuilt during this audit.
