# Ordered implementation plan

Last updated: **2026-10-27**
Baseline commit: **adc5239** (`feat: automate Reckless Revenants batch 1 effects`)

Companion document: [testing-order.md](testing-order.md).

This is the execution order for the remaining card-effect work. It is ordered by
dependency, not by card count. Do not skip a batch gate. Do not start a later
batch because it looks easier; the earlier batch establishes a primitive that
later cards reuse.

At the start of every batch, re-measure the counts. At the end of every batch,
run the full gate and record evidence. If a card cannot be completed, record the
concrete engine or authoring dependency in `docs/scripts/blocked.md`, mark the
card blocked, and continue. Never mark a blocked card `curated`.

---

## 1. Measured state at the baseline

| Metric | Value |
| --- | ---: |
| Collectible text cards | 1,552 |
| Scripts present | 282 (18.2%) |
| Verified (`curated` + metadata + test) | 56 (3.6%) |
| Missing scripts | 1,270 |
| Entries in `data/scripts.json` | 288 (282 collectible text + 5 generated/level-2 + 1 local custom) |
| Starter-cohort text cards | 179 |
| Starter-cohort scripted | 73 |
| Starter-cohort verified | 47 |
| Starter-cohort missing | 106 |

| Deck | Text | Scripted | Verified | Missing | `auto` |
| --- | ---: | ---: | ---: | ---: | ---: |
| Vanguard Disciplines | 29 | 29 | 29 | 0 | 0 |
| Reckless Revenants | 31 | 19 | 18 | 12 | 1 |
| Frost & Flame | 32 | 4 | 1 | 28 | 3 |
| Tides of the Peak | 32 | 10 | 0 | 22 | 10 |
| Sands & Secrets | 34 | 6 | 0 | 28 | 6 |
| Runeterra Wanderers | 36 | 9 | 0 | 27 | 9 |

Per-deck counts double-count cards shared between decks. The unique cohort total
is 179 text cards, 73 scripted, 47 verified, 106 missing, and 26 `auto` scripts
(25 unique `auto` scripts in the other four decks plus Draven). Draven is handled
in batch 4; the other 25 are handled in the Phase 2.2 audit.

The published 0.3.0 artifact is unchanged and still carries 270 scripts / 38
verified. The counts above are the current working tree, not the release.

---

## 2. Remaining Reckless Revenants queue

Thirteen cards are not verified. Twelve are missing; Draven is `auto`.

| Card | Type / cost | Printed effect | Dependency | Batch | Result |
| --- | --- | --- | --- | --- | --- |
| `01SI011` Ravenous Butcher | Unit 0, 3/2 | To play me, kill an ally. | Additional play-cost hook | 2a | 21/31 after 2a |
| `05NX006` Reborn Grenadier | Unit 1, 3/2, Ephemeral | To play, discard 1. When I'm discarded, summon an exact copy of me. | Additional play-cost hook; discard watcher; exact-copy summon from discard context | 2a | 21/31 after 2a |
| `01SI047` Fading Memories | Spell 0, Burst | Pick a follower. Create an Ephemeral copy of it in hand. | Copy-to-hand | 2a | 21/31 after 2a |
| `06NX020` The Darkin Ballista | Equipment 1 | You may spend 8 mana to play me as Naganeka of Zuretta. | Play-as / alternate cost; `06NX020T1` script | 2b | 23/31 after 2b |
| `04SI004` The Wings and The Wave | Unit 1, 0/1 | Play: Play me as First Wave or Last Wind. | Play-as; `04SI004T1`, `04SI004T2`, `04SI014`; Last Wind uses the play-cost hook | 2b | 23/31 after 2b |
| `03SI016` Go Hard | Spell 1, Slow | Drain 1 from a unit. Create 2 copies of Go Hard in your deck. Every third time this happens, transform all copies of me everywhere into Pack Your Bags. | Deck copies; per-card play counter; transform-all-copies; `03SI016T1` script | 3a | 26/31 after 3a |
| `07SI013` Proliferating Darkwraith | Unit 1, 1/1, Last Breath | Last Breath: Create in deck an exact copy of your strongest Proliferating Darkwraith in deck, then double the stats of Proliferating Darkwraiths in deck. | In-deck copy; in-deck stat mutation; strongest-in-deck selection | 3a | 26/31 after 3a |
| `09NX025` The Arena's Greatest | Landmark 1 | I-II: Give an ally +2\|+0 this round. III: Give an enemy Can't Block this round. | Landmark countdown stages; `09NX025T2` script | 3a | 26/31 after 3a |
| `08SI003` Shackled Ghasts | Unit 1, 1/1, Last Breath | Last Breath: The next time you revive an ally, create a copy of me in hand. | Generic revive action/event; delayed next-revive trigger; copy-to-hand | 3b | 27/31 after 3b |
| `01NX020` Draven | Champion 3, 3/3, QuickStrike | When I'm summoned or strike: Create a Spinning Axe in hand. Level-up: I've struck with 2+ total Spinning Axes. | Play-cost hook for Spinning Axe; per-unit axe-strike counter; `01NX020T1`, `01NX020T2`, `01NX020T3` scripts | 4 | 29/31 after 4 |
| `01SI053` Elise | Champion 2, 2/3, Fearsome | Attack: Summon an attacking Spiderling. Level-up: Round Start: You have 3+ other Spiders. | Attacking summons; Spider subtype/aura; `01SI002`, `01SI053T1`, `01SI053T2` scripts | 4 | 29/31 after 4 |
| `06SI003` Fireth, Reaper of the Sands | Unit 1, 1/1, Ephemeral, Can't Block | When I'm summoned, I Improvise. | Improvise equipment pool and attach flow | 5 | 31/31 or blocked |
| `03NX003` Blade Squire | Unit 1, 2/1, Last Breath | Last Breath: Reforge. | Reforge fragment tracking; Blade of the Exile; `03NX008`, `03NX010`, `03NX011`, `03NX012` scripts | 5 | 31/31 or blocked |

Associated cards are part of the batch. A champion is not verified if its
level-two form, token, or named associated card is missing and the printed
effect depends on it.

---

## 3. Dependency graph

Read this before changing the order.

```text
2a.1 additional play costs
  -> Ravenous Butcher
  -> Reborn Grenadier
  -> Last Wind (04SI004T1)
  -> Spinning Axe (01NX020T1)
  -> Darkin Bloodletters / Darkin Staff (Sands & Secrets)
  -> Poro Cannon / Scrapheap (Frost & Flame / Sands & Secrets)

2a.2 copy-to-hand
  -> Fading Memories
  -> Sacrificial Scholar (Runeterra Wanderers, spell copies)
  -> other hand-copy work

2b play-as / alternate cost
  -> depends on 2a.1 for additional costs
  -> The Darkin Ballista + Naganeka
  -> The Wings and The Wave + First Wave / Last Wind
  -> Darkin Bloodletters / Darkin Staff

3a in-deck state and countdown stages
  -> Go Hard + Pack Your Bags
  -> Proliferating Darkwraith
  -> The Arena's Greatest
  -> Frozen Thrall / Ancient Preparations / Buried Armory
  -> Counterfeit Copies / Yeti Yearling / Omen Hawk

3b revive and delayed next-revive
  -> Shackled Ghasts
  -> future revive cards

4 champion and attacking-summon support
  -> depends on 2a.1 for Spinning Axe
  -> Draven + Spinning Axe + Whirling Death + level 2
  -> Elise + Spiderling + level 2 + Spider aura
  -> Azir (Sands & Secrets), Destined Poro (Sands & Secrets)

5 equipment keyword support
  -> Fireth / Improvise
  -> Blade Squire / Reforge / Blade of the Exile
```

Rules:

- Do not implement play-as before the additional-cost hook. Last Wind and
  Darkin Bloodletters need both.
- Do not implement Draven before Spinning Axe's discard cost works.
- Do not implement Shackled Ghasts before a real revive action/event exists.
- Do not implement The Arena's Greatest before the countdown-stage schedule
  exists.
- Do not mark a card verified if its associated form or token is unscripted when
  the printed effect needs it.

---

## 4. Batch template

Every batch follows the same sequence.

1. **Baseline.** Clean working tree, `git pull`, `npm run test:all`, coverage
   snapshot, cohort snapshot.
2. **Triage.** Read the printed text from `data/cards.json`. List every clause,
   keyword, target, cost, zone, and associated card. Do not infer the effect
   from an existing script or from memory.
3. **Dependency check.** Confirm every primitive the card needs exists. If not,
   split the batch or record the blocker.
4. **Batch file.** Create
   `scripts/batches/<date>-reckless-revenants-<batch>.json`. Never hand-edit
   `data/scripts.json`.
5. **Validation.** Run
   `npm run scripts:apply -- <batch.json> --check` before applying.
6. **Implementation.** Add the smallest engine primitive that satisfies all
   cards in the batch. Do not add speculative fields.
7. **Tests.** Write tests first or alongside the implementation. Every clause
   needs a positive test and at least one negative or timing test. See
   [testing-order.md](testing-order.md).
8. **Verification metadata.** Every curated card gets `version`, `verifiedAt`,
   `verifiedBy`, `test` pointing to the exact test name, `clauses`, and notes.
9. **Apply.** Apply the batch with the batch tool, not by editing the data file.
10. **Full gate.** `npm run test:all`, `npm run scripts:lint`,
    `npm run scripts:starter-cohort`, coverage report.
11. **Documentation.** Update `docs/scripts/blocked.md`,
    `docs/scripts/coverage-0.3.0.md`, `docs/scripts/starter-cohort.md`,
    `docs/effect-dsl.md` for new vocabulary, and `AGENTS.md` / `ROADMAP.md`
    evidence.
12. **Commit and push.** One coherent commit per batch. Confirm no release tag
    or artifact changed.
13. **Evidence.** Record commit SHA, test counts, lint counts, coverage, and
    any blocked card with its dependency.

---

## 5. Batch 0 — Baseline and guardrails

Goal: make the next batch safe to start.

- [ ] Confirm the working tree is clean and the branch is
      `feature/desktop-internet-multiplayer`.
- [ ] Run `npm run test:all`. Baseline is 47 syntax files, 288 lint entries,
      215 tests, 0 failures.
- [ ] Run `npm run scripts:coverage -- --json` and record
      282 present / 56 verified / 1,270 missing.
- [ ] Run `npm run scripts:starter-cohort` and record
      179 text / 73 scripted / 47 verified / 106 missing.
- [ ] Confirm `v0.2.0` and `v0.3.0` tags and `release/` artifacts are untouched.
- [ ] Read `docs/scripts/blocked.md` and this document completely.
- [ ] Back up `data/scripts.json` before the first apply. The batch tool also
      writes a backup; keep both until the batch is committed.

Exit gate: baseline green; no uncommitted changes; the batch file is valid.

---

## 6. Batch 2a — Additional play costs and copy-to-hand

Goal: add the pre-play cost stage and copy-to-hand, then clear three cards.
Result: Reckless Revenants goes from 18/31 to 21/31 verified.

### 6.1 Batch 2a.1 — Additional play costs

Cards:

- `01SI011` Ravenous Butcher — "To play me, kill an ally."
- `05NX006` Reborn Grenadier — "To play, discard 1."

Required behavior:

- A script can declare an additional cost that must be paid before the card
  leaves hand and before it enters play.
- Supported cost types in this batch: `killAlly` and `discard` (amount 1).
  Design the cost object so future `spendAllMana` and combined costs
  (mana + kill an ally) fit without a second mechanism.
- The cost is mandatory. If no legal cost target exists, the play is rejected
  with a clear error/needs-cost response; the card stays in hand, mana is not
  spent, stats are not incremented, and no play/summon trigger fires.
- The choice is cancellable before payment. Cancellation leaves hand, mana,
  board, discard, and stats unchanged.
- Payment is atomic. Validate the cost target, validate mana, then pay mana and
  the additional cost together. A failure must refund every mutation.
- The additional cost resolves before the new unit enters play. A killed ally's
  death/Last Breath triggers and a discarded card's discard trigger resolve
  before the new unit's summon/play triggers. Log and event order must be
  deterministic.
- `handView` and `playable` must reflect cost legality. A card whose cost cannot
  be paid must not appear silently playable, or the play attempt must return a
  deterministic needs-cost response.
- 2v2: "ally" means any unit on the controller's team; enemy-team units are not
  legal. The discard cost uses the controller's hand.

Expected touch points:

- `shared/script-vocabulary.js` — cost type vocabulary.
- `server/script-lint.js` — reject unknown cost types and missing required
  fields.
- `server/engine/game.js` — `canPlay`, `playCard`, `handView`, `playable`, new
  cost helper(s).
- `server/engine/effects.js` only if a cost reuses an effect action.
- `docs/effect-dsl.md` — document the new field and payment order.
- `test/reckless-revenants-02.test.mjs` — new tests.

Reborn Grenadier's second clause is a discard watcher, not part of the play
cost. The existing `discardCards` path dispatches a discard event, but it
currently chooses randomly or takes the first card and stores only card IDs in
the discard pile. The implementation must:

- allow the play-cost discard to select a specific card;
- preserve the discarded hand entry's current stats/keywords long enough for
  the trigger (or copy from the event context);
- summon an exact copy for the owner, not the discarding player;
- avoid a loop when Grenadier is discarded by its own cost;
- define whether hand-limit burn counts as discard (it should not unless the
  printed rules say so) and test the distinction.

Exit gate after 2a.1: 20/31 verified; Ravenous Butcher and Reborn Grenadier
curated with tests; no regression.

### 6.2 Batch 2a.2 — Copy-to-hand

Card:

- `01SI047` Fading Memories — "Pick a follower. Create an Ephemeral copy of it
  in hand."

Required behavior:

- Target a follower in play. Champions, landmarks, spells, equipment, and
  cards in hand are not legal targets.
- The copy is a new card instance in the caster's hand with the follower's
  current stats and keywords, plus Ephemeral. The original is unchanged.
- Define and test current-damage/buff behavior, attachments/equipment, and
  token copies. Do not silently copy printed stats when the printed word is
  "copy."
- Burst timing: the spell resolves immediately, can be played during combat or
  on a non-empty stack where Burst is legal, and does not pass priority.
- If there is no legal follower, the play is rejected; the card stays in hand.
- If the hand is full, the copy burns using the engine's hand-limit rule; the
  original remains.
- 2v2: any follower on any team is a legal target; the copy goes to the caster,
  not the follower's owner.
- Private/public logging must not reveal hidden hand contents.

Expected touch points: `server/engine/effects.js`, `server/engine/game.js`,
`shared/script-vocabulary.js`, `server/script-lint.js`,
`docs/effect-dsl.md`, `test/reckless-revenants-02.test.mjs`.

Exit gate after 2a: 21/31 verified; 9 missing plus Draven `auto`; full suite
green.

---

## 7. Batch 2b — Play-as and alternate cost

Cards:

- `06NX020` The Darkin Ballista — "You may spend 8 mana to play me as Naganeka
  of Zuretta." Associated form `06NX020T1`.
- `04SI004` The Wings and The Wave — "Play: Play me as First Wave or Last
  Wind." Associated forms `04SI004T1`, `04SI004T2`, and token `04SI014`.

Dependency: batch 2a.1. Last Wind has "To play me, kill an ally"; Darkin
Bloodletters and Darkin Staff in Sands & Secrets reuse the same layer.

Required behavior:

- A card can offer a pre-play mode choice: normal play or play as an alternate
  form. The choice happens before mana is spent and before the card leaves
  hand; cancel is a no-op.
- The alternate mode can have a different mana cost and additional costs. The
  base card's printed cost is not paid twice. Validate the full cost package
  before payment.
- If the alternate mode's additional cost is illegal, that mode is disabled or
  rejected without affecting the normal mode. The player can cancel and choose
  the normal mode.
- The alternate form enters play with its own card ID, type, stats, keywords,
  script, and triggers. For an Equipment that becomes a unit, do not attach it
  to an ally and do not leave the equipment in the equipment zone.
- The base card does not remain in play, hand, or discard as a duplicate.
  Define the zone identity for recall/transform and test it.
- Normal-mode behavior remains unchanged: The Darkin Ballista still attaches as
  Equipment for 1 mana with a legal allied unit; The Wings and The Wave still
  costs 1 and resolves its Play choice.
- `handView` and `playable` must account for both modes. The base card is
  playable if at least one mode is legal and affordable.
- Naganeka's Round End trigger must be scripted and tested: the strongest enemy
  and Naganeka strike each other. Cover no enemy, ties, deaths, Overwhelm,
  silence, and 2v2.
- First Wave's summon trigger must summon Prey (`04SI014`); Last Wind must use
  the batch-2a kill-ally cost. Cover full board and no-ally cases.
- 2v2: team scoping for "ally"/"enemy" and owner/controller on transform.

Expected touch points: `shared/script-vocabulary.js` (play-as/alternate cost
fields), `server/script-lint.js`, `server/engine/game.js` (`playCard`,
`handView`, `playable`, transform/replace path), `server/engine/effects.js` if
the play-as path reuses transform, `docs/effect-dsl.md`,
`test/reckless-revenants-02.test.mjs`.

Exit gate: 23/31 verified; 7 missing plus Draven `auto`; associated forms and
tokens curated; full suite green.

---

## 8. Batch 3a — In-deck state and countdown stages

Goal: clear the three cards that need deck mutation and landmark stages.
Result: 26/31 verified after this batch.

### 8.1 Batch 3a.1 — In-deck copies, counters, and transform-all

Cards:

- `03SI016` Go Hard — drain 1; create 2 copies in deck; every third time,
  transform all copies everywhere into Pack Your Bags (`03SI016T1`).
- `07SI013` Proliferating Darkwraith — Last Breath: create in deck an exact copy
  of the strongest Proliferating Darkwraith in deck, then double the stats of
  Proliferating Darkwraiths in deck.

Required behavior:

- Deck entries must carry mutable card state (at least current attack/health
  and a stable identity) without breaking save/load or migration. The current
  deck stores card IDs; do not lose the card ID or corrupt deck order.
- "Exact copy" copies the current deck state of the selected card, not just
  printed stats. Define whether buffs and temporary modifiers are copied.
- "Strongest" needs an explicit, deterministic definition and tie-breaker
  (for example: highest attack, then highest health, then deck order, then card
  ID). Record the choice in the DSL docs and tests.
- Doubling applies to both attack and health of every matching card in deck.
  Define whether the newly created copy is included; the printed order says
  create, then double, so test that interpretation.
- Go Hard's counter is per player and per card, not global. It increments on
  resolution, not on being played if countered, discarded, milled, or
  obliterated. Define whether a fizzled resolution counts.
- On the third resolution, transform all Go Hard copies in hand, deck, discard,
  and any other zone the engine exposes. Include the two copies just created
  and the resolving card if it is in a zone. Do not leave a copy behind.
- Pack Your Bags must transform all its copies back to Go Hard when played, and
  the counter behavior after that must be defined and tested.
- 2v2: counters and decks are per player. "Enemy Nexus" in Pack Your Bags means
  the opposing team's Nexus/Nexuses according to the engine's team model.

Expected touch points: `server/engine/game.js` (deck entry state, draw/zone
helpers), `server/engine/effects.js` (copy/transform/counter actions),
`shared/script-vocabulary.js`, `server/script-lint.js`, `docs/effect-dsl.md`,
`test/reckless-revenants-03.test.mjs`.

### 8.2 Batch 3a.2 — Landmark countdown stages

Card:

- `09NX025` The Arena's Greatest — "I-II: Give an ally +2|+0 this round. III:
  Give an enemy Can't Block this round." Associated `09NX025T2`.

Required behavior:

- A landmark script can declare a stage schedule for each countdown step.
  The local card JSON does not carry an explicit countdown length; confirm the
  printed/source value before coding. Do not guess and do not hard-code a
  number without recording the source.
- Stage I and II give an allied unit +2|+0 this round. Stage III gives an enemy
  Can't Block this round.
- The stage effect resolves before the landmark is destroyed on the final
  countdown step. If the landmark is destroyed early, no later stage fires.
- If there is no legal target, the stage resolves as a no-op with a log entry;
  it must not stall or pick an illegal target.
- Multiple copies of the landmark have independent stage state.
- The round buff expires at round end; the Can't Block effect expires at round
  end and is enforced by combat legality.
- 2v2: ally/enemy team scoping; target selection across the team.

Expected touch points: `server/engine/game.js` (countdown advance),
`server/engine/effects.js` (stage actions), `shared/script-vocabulary.js`
(stage fields), `server/script-lint.js`, `docs/effect-dsl.md`,
`test/reckless-revenants-03.test.mjs`.

Exit gate: 26/31 verified; 4 missing plus Draven `auto`; full suite green.

---

## 9. Batch 3b — Revive and Shackled Ghasts

Card:

- `08SI003` Shackled Ghasts — "Last Breath: The next time you revive an ally,
  create a copy of me in hand."

Dependency: a generic revive action/event. The engine currently has Deathless
self-revival but no general revive. Do not fake "revive" by summoning from
discard; the distinction matters for death/Last Breath and for the delayed
trigger.

Required behavior:

- A revive action returns a dead allied unit from the discard pile to play
  (define whether other zones are legal; the printed text says revive, not
  recall). It fires a revive event with the revived unit and controller.
- On Shackled Ghasts's Last Breath, register a delayed trigger for its
  controller: the next successful revive of an ally creates a copy of Shackled
  Ghasts in hand.
- The trigger is consumed exactly once per Ghasts. Multiple Ghasts stack; one
  revive consumes one trigger per Ghasts. A failed revive does not consume it.
- The trigger persists across rounds and turn changes until a revive happens.
- The copy goes to the controller's hand; hand-limit burn applies. It is a copy
  of Shackled Ghasts with its printed stats, cost, and Last Breath.
- Define and test reviving Shackled Ghasts itself, reviving during the same
  death batch, reviving an enemy unit, and a revive that is countered/fizzles.
- 2v2: "you" is the player who controls the Ghasts; only that player's revives
  consume the trigger. The copy goes to that player.

Expected touch points: `server/engine/game.js` (revive action, delayed trigger
registry, discard zone), `server/engine/effects.js` (revive action/event),
`shared/script-vocabulary.js`, `server/script-lint.js`, `docs/effect-dsl.md`,
`test/reckless-revenants-03.test.mjs`.

Exit gate: 27/31 verified; 3 missing plus Draven `auto`; full suite green.

---

## 10. Batch 4 — Champions and attacking summons

Goal: clear Draven and Elise, including their level-two forms, tokens, and
associated cards. Result: 29/31 verified.

### 10.1 Batch 4a — Draven

Cards and associated forms:

- `01NX020` Draven — summon or strike creates a Spinning Axe in hand.
- `01NX020T1` Spinning Axe — 0-cost Burst; "To play, discard 1. Give an ally
  +1|+0 this round." Uses the batch-2a play-cost hook.
- `01NX020T2` Draven's Whirling Death — Fast; a battling ally strikes a
  battling enemy; create a Draven in your deck.
- `01NX020T3` Draven level 2 — summon or strike creates 2 Spinning Axes;
  QuickStrike and Overwhelm.

Required behavior:

- The base summon and strike triggers create exactly one Spinning Axe in hand.
  Define "strike" consistently with the engine's strike event; do not trigger
  on block, damage, or being targeted.
- Spinning Axe's discard cost is the batch-2a cost. Cover no discard, discard a
  champion/spell/unit, cancel, and round-end expiry of the buff.
- The level-up condition is "I've struck with 2+ total Spinning Axes." Do not
  reuse `selfStrikesThisGame` (that counts all strikes). Define the counter
  from the printed wording: it must count qualifying strikes with Spinning Axe
  and not ordinary strikes. Record the interpretation and test 0/1/2/3.
- On level-up, swap to `01NX020T3` using the engine's champion level-up path,
  preserve current damage/health state according to the engine's rules, and
  fire the level-up trigger once.
- Level 2 creates two Spinning Axes on summon and on strike; it has
  QuickStrike and Overwhelm.
- Draven's Whirling Death must target a battling ally and a battling enemy,
  make the ally strike, then create a Draven in the owner's deck. Cover no
  battling pair, counter, deaths, and 2v2.
- Champion copy limits and deck validation still apply.

Expected touch points: `server/engine/game.js` (strike tracking, level-up,
champion swap), `server/engine/effects.js` (create/Strike), `shared/script-
vocabulary.js` if a new counter/condition is needed, `server/script-lint.js`,
`docs/effect-dsl.md`, `test/reckless-revenants-04.test.mjs`.

### 10.2 Batch 4b — Elise

Cards and associated forms:

- `01SI053` Elise — Attack: summon an attacking Spiderling; level-up: Round
  Start with 3+ other Spiders.
- `01SI002` Spiderling — 1/1 Spider.
- `01SI053T1` Elise's Crawling Sensation — if an ally died this round, summon 2
  Spiderlings; create an Elise in your deck.
- `01SI053T2` Spider Queen Elise — other Spider allies have Challenger and
  Fearsome.

Required behavior:

- On Elise's attack declaration, summon a Spiderling that is attacking in the
  same combat. Define what happens if the board is full, if the attack is
  canceled, and if the token would be blocked. The token participates in combat
  immediately and is not a normal post-combat summon.
- Spiderling has the SPIDER subtype and 1/1 stats.
- Level-up at Round Start counts other allied Spiders (exclude Elise herself;
  include tokens and Spider Queen Elise). Test 2, 3, and 4 other Spiders, and
  the exact moment of the round-start check.
- Level 2's aura grants Challenger and Fearsome to other Spider allies, not to
  Elise herself and not to non-Spiders. Recalculate the aura on summon, death,
  transform, silence, and recall. Test multiple auras and enemy Spiders.
- Elise's Crawling Sensation: if an ally died this round, summon two
  Spiderlings and create an Elise in the owner's deck. Cover the no-death
  branch, board space, and the created card's identity.
- 2v2: attacking summons belong to the attacking team; Spider counts are
  per-team; the aura affects allied Spiders only.

Expected touch points: `server/engine/game.js` (attacking summon, combat
linkage, subtype counts, aura), `server/engine/effects.js` (summon/create),
`shared/script-vocabulary.js` if a Spider condition is needed,
`server/script-lint.js`, `docs/effect-dsl.md`,
`test/reckless-revenants-04.test.mjs`.

Exit gate: 29/31 verified; only Fireth and Blade Squire remain; full suite
green.

---

## 11. Batch 5 — Equipment keyword support

Goal: clear Fireth and Blade Squire, including their equipment/fragment pools.
Result: 31/31 verified or explicitly blocked.

### 11.1 Batch 5a — Fireth and Improvise

Card:

- `06SI003` Fireth, Reaper of the Sands — "When I'm summoned, I Improvise."

Required behavior:

- Confirm the printed Improvise rule and the legal equipment pool from the
  source data. Do not invent a pool or a random selection rule.
- On summon, select/create the equipment and attach it to Fireth using the
  existing equipment/attach flow. Define whether the player chooses or the
  engine chooses randomly; if it is a choice, use the standard choice prompt
  and cancellation policy.
- Fireth is Ephemeral and Can't Block; test those keywords independently.
- Cover no legal equipment, full board/equipment zone, Fireth dying in
  response, silence, detach, and the equipment returning to hand/discard.
- 2v2: the equipment belongs to the controller; enemy equipment is not legal.

Expected touch points: `server/engine/game.js` (equipment pool/attach),
`server/engine/effects.js` (create/equip), `shared/script-vocabulary.js`,
`server/script-lint.js`, `docs/effect-dsl.md`,
`test/reckless-revenants-05.test.mjs`.

### 11.2 Batch 5b — Blade Squire and Reforge

Card:

- `03NX003` Blade Squire — "Last Breath: Reforge."

Associated cards:

- `03NX008` Heavy Blade Fragment — give an ally Overwhelm this round.
- `03NX010` Keen Blade Fragment — give an ally Quick Attack this round.
- `03NX012` Glinting Blade Fragment — give an ally +2|+0 this round.
- `03NX011` Blade of the Exile — grant an ally +2|+0, Overwhelm, and Quick
  Attack.

Required behavior:

- Confirm the printed Reforge rule and the fragment-tracking rule. The local
  data shows three fragments and a combined Blade of the Exile; implement the
  exact set-completion behavior, not an approximation.
- On Last Breath, create the correct fragment in hand; track owned fragments
  per player; handle duplicates and the point at which the combined Blade is
  created.
- Implement/test each fragment's buff and duration, and Blade of the Exile's
  permanent grant.
- Cover hand limit, multiple Blade Squires, silence/obliterate, board/hand
  state, and 2v2 ownership.
- If the exact Reforge rule cannot be established from reliable data, stop and
  record the card as blocked with the missing rule; do not guess.

Expected touch points: `server/engine/game.js` (fragment tracking, hand
creation), `server/engine/effects.js` (buff/grant actions), `shared/script-
vocabulary.js` if a Reforge state is needed, `server/script-lint.js`,
`docs/effect-dsl.md`, `test/reckless-revenants-05.test.mjs`.

Exit gate: 31/31 verified or explicitly blocked; 0 missing and 0 `auto` in
Reckless Revenants; full suite green.

---

## 12. Phase 2.2 — Audit the existing `auto` scripts

Do this after the Reckless deck is closed and before starting Frost & Flame.
It is the cheapest way to raise verified coverage and catch approximations.

The 25 unique `auto` cards in the other four starter decks are:

| Card | Deck(s) | Printed effect | Required checks |
| --- | --- | --- | --- |
| `01FR004` Elixir of Iron | Frost & Flame | Give an ally +0\|+2 this round. | Ally target, round expiry, no target, permanent stats unchanged. |
| `01FR035` Unscarred Reaver | Frost & Flame | When I survive damage, grant me +3\|+0. | Damage survival, lethal, Barrier/Tough, once per damage event. |
| `02BW020` Warning Shot | Tides of the Peak | Deal 1 to the enemy Nexus. | Nexus only, spell mana, no unit target. |
| `02BW032` Gangplank | Tides of the Peak | When I'm summoned, summon a Powder Keg. | Summon trigger, board space, Keg identity. |
| `02BW047` Dreg Dredgers | Tides of the Peak | When I'm summoned, Toss 3. | Toss count, deck under 3, toss triggers. |
| `02BW058` Jagged Butcher | Tides of the Peak | Plunder: Grant me +1\|+1. | Plunder on/off, permanent stats. |
| `03BW015` Crusty Codger | Tides of the Peak | Play: Deal 2 to me. | Self-damage, survive/die, ordering. |
| `03MT028` Solari Shieldbearer | Runeterra Wanderers | Daybreak: Give me +0\|+4 this round. | Daybreak on/off, round expiry. |
| `03MT048` Gift Giver | Tides / Runeterra | When I'm summoned, create a Gem in hand. | Hand creation, hand full, card identity. |
| `03MT054` Leona | Tides of the Peak | Daybreak: Stun the strongest enemy. | Strongest selection, tie, no enemy, champion. |
| `03MT073` Lunari Duskbringer | Tides / Runeterra | When I'm summoned, create a Duskpetal Dust in hand. | Hand creation, hand full. |
| `03MT088` Solari Soldier | Tides / Runeterra | Daybreak: Give me +1\|+1 this round. | Daybreak on/off, round expiry. |
| `03MT092` Mountain Goat | Runeterra Wanderers | Strike: Create a Gem in hand. | Strike event, hand full. |
| `03MT094` Lunari Shadestalker | Runeterra Wanderers | Nightfall: Grant me Elusive. | Nightfall on/off, permanent keyword. |
| `04MT004` Blue Sentinel | Runeterra Wanderers | Last Breath: Summon a Crest of Insight. | Last Breath, board space. |
| `04MT013` Solari Sunhawk | Runeterra Wanderers | Daybreak: Stun the strongest enemy. | Strongest selection, tie. |
| `04SH026` Dunekeeper | Sands & Secrets | When I'm summoned, summon a Sand Soldier. | Summon trigger, board space. |
| `04SH054` Treasure Seeker | Sands & Secrets | When I'm summoned, create a Waking Sands in hand. | Hand creation, hand full. |
| `04SH079` Scrying Sands | Sands & Secrets | Predict. Give an enemy -2\|-0 this round. | Predict, enemy target, round expiry. |
| `04SH083` Feral Prescience | Sands & Secrets | Predict. | Predict with under 3 cards, deterministic pick. |
| `05BC004` Otterpus | Sands & Secrets | When I'm summoned, create a Prank in hand. | Hand creation, hand full. |
| `07BW003` Pocket Picker | Tides of the Peak | Last Breath: Create a Coin in hand. | Last Breath, hand full. |
| `07MT003` Cosmic Youngling | Runeterra Wanderers | Round Start: Heal me and your Nexus 1. | Damaged/full health, Nexus heal, round start. |
| `08PZ026` Galesong Call | Frost & Flame | Summon a Galesong Swallow. | Token identity, board space. |
| `09BC011` Gloomsprites | Sands & Secrets | Strike: Grant me Impact. | Strike event, permanent keyword. |

For each card:

- [ ] Read the printed text from `data/cards.json`.
- [ ] Compare every clause to the current `auto` script.
- [ ] Add a deterministic regression test that fails if the script is removed.
- [ ] Fix approximations; if the script cannot be made exact, mark it `partial`
      or blocked and record why.
- [ ] Add verification metadata and change the status to `curated` only when
      every clause is covered.
- [ ] Update the cohort and coverage reports.

Exit gate: 0 `auto` scripts in the starter cohort; Draven is curated in batch 4
or this audit; the 25 cards above are curated or explicitly blocked.

---

## 13. Deck 3 — Frost & Flame

Current state: 32 text cards, 4 scripted (1 curated shared Catch!, 3 `auto`),
28 missing.

Before coding:

- [ ] Produce a card-by-card triage table in this document or a linked
      `docs/scripts/triage-frost-and-flame.md`: ID, name, printed text,
      dependency, proposed batch, test file.
- [ ] Group by mechanic. Known overlaps: spend-all-mana costs (Production
      Surge, Thermogenic Beam, Epic Scraptraption), discard costs (Poro
      Cannon), in-deck copies (Counterfeit Copies, Yeti Yearling), countdown
      (Frozen Thrall), top-deck buffs (Omen Hawk), enemy-deck copies and Poison
      Puffcaps (Stinky Whump).
- [ ] Order within the deck: vanilla/keyword-only, simple play effects,
      targeted effects, conditional effects, death/attack triggers, champion
      level-ups, then complex multi-clause cards.
- [ ] Reuse existing primitives; add only the gaps the triage proves.

Exit gate: 32/32 verified or explicitly blocked; 0 `auto`; 10-round deck
simulation passes.

---

## 14. Deck 4 — Tides of the Peak

Current state: 32 text cards, 10 `auto`, 22 missing, 0 curated.

Before coding: produce the triage table. Known mechanics include Toss, Plunder,
Daybreak/Nightfall, Predict, and Bilgewater/Targon interactions. Reuse the
`auto` audit results. Exit gate: 32/32 verified or blocked; 0 `auto`.

---

## 15. Deck 5 — Sands & Secrets

Current state: 34 text cards, 6 `auto`, 28 missing, 0 curated.

Before coding: produce the triage table. Known overlaps: Fireth (cleared in
batch 5), Azir's attacking summons (cleared in batch 4), Darkin equipment
play-as and additional costs (cleared in batch 2), countdown landmarks (cleared
in batch 3a), Destined Poro's level-up transform (cleared in batch 4). Exit
gate: 34/34 verified or blocked; 0 `auto`.

---

## 16. Deck 6 — Runeterra Wanderers

Current state: 36 text cards, 9 `auto`, 27 missing, 0 curated.

Before coding: produce the triage table. Known mechanics include Daybreak,
Nightfall, Chimes, Predict, and spell-copy effects. Reuse the auto audit and the
copy-to-hand primitive. Exit gate: 36/36 verified or blocked; 0 `auto`.

---

## 17. Cohort acceptance

- [ ] All 179 starter text cards are `curated` or explicitly blocked with a
      concrete dependency. 0 `manual`, 0 `auto`.
- [ ] Every distinct effect has a regression test that fails if the script is
      removed.
- [ ] A deterministic 10-round simulation for each of the six starter decks
      completes with no engine error, no unresolved choice, no unknown action
      log, no negative mana/health, and no orphaned delayed trigger.
- [ ] Run the simulation with multiple fixed seeds and record them.
- [ ] Regenerate `docs/scripts/coverage-0.3.0.md` and
      `docs/scripts/starter-cohort.md`; update `docs/scripts/blocked.md`,
      `AGENTS.md`, and `ROADMAP.md`.
- [ ] Confirm shared cards (Catch!, Fireth, etc.) have one coherent verification
      state and do not conflict across decks.
- [ ] Confirm the published 0.3.0 artifact is still untouched.

Exit gate: starter-cohort phase gate met, or every remaining card is explicitly
blocked with a tracked dependency.

---

## 18. Release 0.3.1 decision

Do not cut a release merely because a batch landed. A release requires:

- [ ] The content milestone is closed or the remaining cards are explicitly
      blocked.
- [ ] README and `docs/testing.md` are updated from the published 0.3.0 counts
      to the new release counts at release time.
- [ ] `npm run test:all` passes.
- [ ] `npm run build:win` passes and produces the portable artifact.
- [ ] The artifact is launched on a clean Windows machine/account, if the
      headless-only restriction has been lifted.
- [ ] The release notes state the new counts and the open gates.
- [ ] `v0.3.1` is tagged and published without moving `v0.2.0` or `v0.3.0`.
- [ ] The checksum and size are recorded in README/ROADMAP/testing evidence.

If the release gates are still open, ship nothing and keep the working tree
ahead of the release. Do not describe the 0.3.0 artifact as containing the new
scripts.

---

## 19. Parallel release-gate track

Content work does not close these gates. Schedule them separately and record
evidence, not assumptions.

1. Headless regression: `npm run test:all`, lint, seed build, package checks.
2. Local two-instance full 1v1: host/join, mulligan, start, play, pass, combat,
   rematch, host close.
3. Local 2v2: team assignment, priority, targeting, partner visibility,
   surrender/rematch.
4. Spectator: join, state filtering, hidden information, leave.
5. Reconnect: mid-game data-channel loss, token rotation, resume, cancel.
6. Host departure: guest return Home, room closure, no orphan process.
7. External network: two separate internet connections, host/join, full game;
   record NAT/relay/TURN behavior.
8. Clean machine: fresh Windows account, launch, data persistence, shutdown.
9. Mulligan stall: reproduce, capture logs/state, fix, regression test.

The current headless-only instruction means items 2–8 are **not run**, not
failed. Do not claim them from local tests.

---

## 20. Stop conditions and anti-patterns

Stop and document instead of guessing when:

- The printed rule or associated form is ambiguous.
- A primitive would need speculative fields that no batch card proves.
- A test would pass without the script.
- A card needs an associated card that is missing and unverified.
- A batch would hand-edit `data/scripts.json`.
- A release tag or artifact would change.
- A local test is being used to claim external-network or 2v2 verification.

Never:

- Mark a card `curated` because the script exists.
- Count generated/`auto` scripts as verified.
- Call coverage "correctness."
- Hide a blocked card by leaving it `auto`.
- Push a batch with a red full gate.
- Rewrite published release counts into the 0.3.0 artifact claims.
