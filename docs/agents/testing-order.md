# Ordered testing plan

Last updated: **2026-10-27**
Baseline commit: **adc5239**

Companion document: [implementation-order.md](implementation-order.md).

This document is the ordered test plan for the remaining card-effect work. It is
not a list of happy paths. Every clause needs a positive test, a negative test,
and at least one timing or zone test. A test that only asserts a script exists,
a snapshot, or "the game did not crash" does not count.

The current instruction is **headless only**: no desktop app launch, no game
window, no PC playtesting, and no external-network claims. Release-gate tests
that require those are listed at the end but are **not run** under the current
instruction.

---

## 0. Test discipline

- Use `node:test` and `node:assert/strict`; assert exact values with
  `assert.equal` and use `assert.ok` only for existence.
- Create a fresh `Game` per test. Do not share mutable game state across tests.
- Use a fixed RNG seed (at least 42; add 1 and 1234 for random-selection tests).
- Clear hands/decks explicitly when the test needs a controlled zone; do not
  rely on the starter deck's contents.
- Assert exact mana, hand size, deck size, discard size, board size, stats,
  keywords, counters, and trigger counts.
- Assert both the effect and the absence of side effects.
- Test the printed text, not the current script. Read `data/cards.json` before
  writing the test.
- A new test must fail if the card's script is removed or reverted to `auto`.
  Verify this locally by temporarily disabling the script in a scratch copy; do
  not commit the mutation.
- No `.only`, `.skip`, `console.log`, `TODO`, or arbitrary sleeps.
- No network, database, file-watcher, or timing-dependent tests.
- For random effects, assert the legal pool and the deterministic selection
  under the fixed seed; do not assert a single hard-coded card unless the test
  sets the pool to one card.
- For 2v2, use four players with explicit teams. Treat 2v2 coverage as
  headless engine coverage, not full-mode verification.
- Run the focused file first, then the full gate. A focused pass is not a
  batch pass.

Commands:

```powershell
node --test test/reckless-revenants-02.test.mjs
npm run test:all
npm run scripts:lint
npm run scripts:starter-cohort
npm run scripts:coverage -- --markdown --out docs/scripts/coverage-0.3.0.md
```

Expected baseline for the current tree:

- Syntax: 47 files.
- Lint: 288 entries, 0 errors, 0 warnings.
- Tests: 215 passing, 0 failing.
- Coverage: 282 present, 56 verified, 1,270 missing.
- Starter cohort: 179 text, 73 scripted, 47 verified, 106 missing.

Re-measure before trusting these numbers.

---

## 1. Global pre-flight (before every batch)

- [ ] `git status --short` is clean (or only the intended batch files are
      uncommitted).
- [ ] `git pull` and confirm the branch.
- [ ] `npm run test:all` passes before any edit.
- [ ] `npm run scripts:coverage -- --json` snapshot recorded.
- [ ] `npm run scripts:starter-cohort` snapshot recorded.
- [ ] `scripts/batches/<batch>.json` validates with
      `npm run scripts:apply -- <batch>.json --check`.
- [ ] Every card's printed text and associated cards are read from
      `data/cards.json`.
- [ ] Every clause is written down before the first test.
- [ ] The expected status change is recorded (for example 18/31 → 21/31).
- [ ] The release tags and `release/` artifacts are confirmed untouched.

After the batch:

- [ ] `npm run test:all` passes with the new tests included.
- [ ] `npm run scripts:lint` reports 0 errors and 0 warnings.
- [ ] New tests fail when the script is removed.
- [ ] Coverage and cohort reports regenerated.
- [ ] `docs/scripts/blocked.md` updated for every resolved or newly blocked
      card.
- [ ] Verification metadata points to the exact test file and test name.
- [ ] No release artifact or tag changed.
- [ ] Commit and push only after all of the above.

---

## 2. Universal per-card matrix

Apply every section to every card. Some sections are not applicable; record why
instead of silently skipping them.

### 2.1 Envelope and metadata

- [ ] Card ID exists in `data/cards.json`, is collectible, and has the printed
      text used by the test.
- [ ] Script status is `curated`, not `auto` or `partial`.
- [ ] `verification.version` is 1; `verifiedAt` is an ISO timestamp;
      `verifiedBy` is `agent`; `notes` is present.
- [ ] `verification.test` points to an existing file and exact test name.
- [ ] `verification.clauses` lists every printed clause, not a summary.
- [ ] The script passes semantic lint with no warnings.
- [ ] The card is included in the coverage report as verified.
- [ ] The card appears with the correct status in the starter-cohort report.

### 2.2 Trigger and timing

- [ ] The trigger fires on the exact event (play, summon, attack, strike,
      death, discard, round start, round end, etc.).
- [ ] It does not fire on adjacent events (for example a strike trigger does not
      fire on block, and a summon trigger does not fire on play if the card was
      not summoned).
- [ ] It fires once per event, not once per damage point or per target.
- [ ] Multiple copies trigger independently.
- [ ] Simultaneous triggers resolve in deterministic order and log the order.
- [ ] A trigger whose source leaves play still resolves or is cancelled
      according to the engine's source-death policy; the test asserts the
      policy.
- [ ] A trigger with no legal target logs a no-op and does not stall.

### 2.3 Targets and choices

- [ ] Every legal target type is tested: ally, enemy, champion, follower,
      landmark, unit, Nexus, hand card, equipment, token.
- [ ] Every illegal target type is rejected: champion for a follower-only
      effect, landmark for a unit-only effect, Nexus for a unit-only effect,
      enemy for an ally-only effect.
- [ ] No legal target produces the correct rejection or no-op.
- [ ] A target that dies/leaves before resolution produces the correct no-op.
- [ ] Choice prompt shows the correct player, minimum, maximum, and options.
- [ ] Cancel/decline is a no-op with no payment or zone change.
- [ ] Invalid/stale target IDs are rejected.
- [ ] Hidden-information choices do not leak the card name/ID in public logs.

### 2.4 Costs and payment

- [ ] Base mana cost is exact; regular vs spell mana is respected.
- [ ] Modified/reduced cost is used by play, hand view, and playable.
- [ ] Additional costs are mandatory and validated before payment.
- [ ] Discard/kill/sacrifice costs move the correct card/unit and fire the
      correct events.
- [ ] Insufficient mana leaves the card in hand, mana unchanged, stats
      unchanged, and no events fired.
- [ ] No legal cost target rejects the play with no partial payment.
- [ ] Cancel/failure refunds every mutation exactly once.
- [ ] `cardsPlayed`, `unitsPlayed`, `spellsPlayed`, `manaSpent`, and
      `cardsPlayedThisRound` increment once on success and zero on failure.
- [ ] Mana cannot go negative; health cannot go negative unless the engine's
      rules allow it.

### 2.5 Resolution and clauses

- [ ] Resolve each printed clause in order.
- [ ] Assert amounts, counts, stats, keywords, durations, and destinations.
- [ ] Assert the source, controller, owner, and team for every created/moved
      card.
- [ ] Assert the effect does not resolve twice.
- [ ] Assert the effect does not resolve if the spell is countered or the
      source is removed according to the rules.
- [ ] Assert the effect's log entry and visibility.

### 2.6 Zones and identity

- [ ] Hand, deck, discard, play, stack, equipment zone, and removed-from-game
      zone behavior.
- [ ] New card instances have new `iid`s; originals are unchanged.
- [ ] Copies preserve the intended state (printed, current, buffed, damaged,
      keywords) and do not share mutable state.
- [ ] Transform changes the card identity and fires the transform event once.
- [ ] Recall/obliterate/death move the card to the correct zone.
- [ ] Hand-limit burn and board-limit behavior.
- [ ] Deck order and shuffle behavior are deterministic under the test seed.
- [ ] Save/load or migration of new deck state, if the batch adds state.

### 2.7 Stats, keywords, and durations

- [ ] Base stats and current stats.
- [ ] Permanent buffs survive round end; round buffs expire exactly at round
      end.
- [ ] Damage and healing do not exceed bounds.
- [ ] Keywords are canonicalized and applied once.
- [ ] Keyword interactions: Barrier, Tough, SpellShield, Ephemeral, Fearsome,
      Challenger, QuickStrike, Overwhelm, Can't Block, Lifesteal, Deathless.
- [ ] Silence removes the effect and the aura; the test checks the resulting
      stats/keywords.
- [ ] Auras recalculate on summon, death, transform, silence, recall, and
      equipment changes.

### 2.8 Death, Last Breath, and revive

- [ ] A normal kill fires death/Last Breath once.
- [ ] Obliterate does not fire Last Breath.
- [ ] Silence prevents Last Breath.
- [ ] Simultaneous deaths resolve in deterministic order.
- [ ] Death triggers see the correct board state and source.
- [ ] Revive is distinct from summon/recall; the test asserts the event.
- [ ] A revived unit's keywords/stats/damage are correct.
- [ ] A delayed "next revive" trigger is consumed exactly once and persists
      when no revive happens.

### 2.9 Stack, priority, and speed

- [ ] Burst resolves immediately and does not pass priority.
- [ ] Focus/Burst/Fast/Slow legality is enforced in combat and on a non-empty
      stack.
- [ ] A Slow spell cannot be played when the stack is non-empty or in combat.
- [ ] A Fast spell can be played at the correct priority window.
- [ ] Countering a spell prevents its effects and any "on resolution" counters.
- [ ] Passing priority and resolving the stack do not duplicate triggers.

### 2.10 Team modes

- [ ] 1v1: ally = controller's team, enemy = opponent.
- [ ] 2v2: ally includes the partner; enemy includes both opponents.
- [ ] Owner vs controller is correct for created/copied/discarded cards.
- [ ] Enemy-team revives/discards do not consume the controller's triggers.
- [ ] Nexus effects hit the correct Nexus/Nexuses.
- [ ] Spectator/hidden views do not reveal private choices or hand cards, if
      the test harness exposes a view.

### 2.11 Negative and no-op cases

- [ ] Empty hand, empty deck, empty discard, full board, full hand.
- [ ] No legal target, no equipment, no fragment, no Spider, no Darkwraith, no
      revive, no discardable card.
- [ ] Source dies before resolution.
- [ ] Target dies before resolution.
- [ ] Effect is countered.
- [ ] Wrong phase/priority.
- [ ] All no-ops log a clear reason and do not leave a pending choice.

### 2.12 Determinism and replay

- [ ] Fixed seed produces the same result across two runs.
- [ ] Random selection only chooses from the legal pool.
- [ ] Ties are resolved by the documented tie-breaker.
- [ ] Replaying the same action does not duplicate counters, copies, or
      triggers.
- [ ] A second copy of the card works independently.

### 2.13 Regression and full gate

- [ ] The test fails when the script is removed/reverted to `auto`.
- [ ] The test fails when the key action is removed from the engine.
- [ ] Focused test file passes.
- [ ] `npm run test:all` passes.
- [ ] `npm run scripts:lint` passes with 0 warnings.
- [ ] Coverage and cohort counts are updated.
- [ ] No stale docs claim the old status.

---

## 3. Batch 2a — Additional play costs and copy-to-hand

Test file: `test/reckless-revenants-02.test.mjs`.

### 3.1 Play-cost primitive

- [ ] `playable`/`canPlay` is false when the additional cost has no legal
      target; true when it does.
- [ ] A play with a legal cost:
  - [ ] pays the mana exactly once;
  - [ ] removes the played card from hand;
  - [ ] moves the cost card/unit to the correct zone;
  - [ ] puts the new unit on the board;
  - [ ] increments `cardsPlayed`/`unitsPlayed` once;
  - [ ] fires the cost event before the new unit's summon/play event;
  - [ ] logs the play and cost deterministically.
- [ ] A play with an illegal cost target returns an error/needs-cost response:
  - [ ] no mana paid;
  - [ ] card stays in hand;
  - [ ] no board/discard change;
  - [ ] no triggers fired;
  - [ ] stats/counters unchanged.
- [ ] A play with insufficient mana and a legal cost pays neither; no prompt
      leaves a pending choice.
- [ ] Cancel/decline after the prompt leaves everything unchanged.
- [ ] A target that dies/leaves between selection and payment aborts the play
      with a full refund.
- [ ] Cost payment is atomic; a failure in the second half does not leave a
      half-paid state.
- [ ] 2v2: an allied partner unit is a legal kill target; an enemy unit is not.
- [ ] 2v2: a discard cost uses the controller's hand, not the partner's.
- [ ] The hand view and playable list reflect cost legality; no hidden
      information leaks.
- [ ] The same card can be played again after a successful play; no stale
      prompt or stale cost target.

### 3.2 Ravenous Butcher (`01SI011`)

Printed: "To play me, kill an ally." Unit 0, 3/2.

- [ ] Play with one allied unit: the unit dies, Butcher enters, 3/2, cost 0.
- [ ] Play with multiple allied units: exactly the chosen one dies.
- [ ] Play with no allied units: rejected; card stays in hand; no mana/stats.
- [ ] Play with only enemy units: rejected.
- [ ] Play with only a landmark: rejected; landmarks are not units.
- [ ] Play with an allied champion: allowed; the champion dies and its death
      triggers fire.
- [ ] Play with an allied Ephemeral unit: allowed.
- [ ] Play with an allied Barrier unit: Barrier does not prevent the kill.
- [ ] Play with an allied SpellShield unit: SpellShield does not prevent the
      kill.
- [ ] Play with the last allied unit: Butcher still enters; the game does not
      end because a unit died.
- [ ] The killed ally's Last Breath resolves before Butcher's summon trigger;
      assert the log/event order.
- [ ] A death trigger that damages the Nexus resolves before Butcher's summon
      trigger.
- [ ] Invalid/stale target ID: rejected before payment.
- [ ] Cancel/decline: no death, no mana, card in hand.
- [ ] 2v2: partner's unit is a legal ally; enemy units are not.
- [ ] `playable` is false with no ally and true with an ally (or the play
      attempt returns a deterministic needs-cost response).
- [ ] Logs: the killed unit is public; no hidden hand information.
- [ ] Playing a second Butcher after the first works.
- [ ] The test fails if the play-cost declaration is removed.

### 3.3 Reborn Grenadier (`05NX006`)

Printed: "To play, discard 1. When I'm discarded, summon an exact copy of me."
Unit 1, 3/2, Ephemeral.

- [ ] Play with two cards in hand: choose one to discard; Grenadier enters
      3/2 Ephemeral; mana 1 paid; hand size decreases by 2.
- [ ] Play with only Grenadier in hand: rejected; no self-discard loop; card
      stays; no mana; no discard trigger.
- [ ] Play with one other card: that card is discarded; Grenadier enters.
- [ ] Discard a champion, spell, unit, equipment, and landmark: each is legal
      unless the rules restrict the card type.
- [ ] Discard a card with a discard trigger: its trigger fires; assert ordering
      against Grenadier's summon.
- [ ] Discard a card with Last Breath: Last Breath does not fire (discard is
      not death).
- [ ] Discard a Fleeting card: legal.
- [ ] Cancel/decline: no discard, no mana, Grenadier in hand.
- [ ] Invalid discard target: rejected before payment.
- [ ] Discard from a generic effect (not the play cost): Grenadier's discard
      trigger summons an exact copy.
- [ ] Enemy-caused discard: the owner gets the copy, not the enemy.
- [ ] Random discard: the trigger uses the actual discarded card.
- [ ] Hand-limit burn: does not count as discard unless the rules say so; test
      the chosen behavior.
- [ ] Exact copy: same card ID, 3/2, Ephemeral, current buffs/keywords, new
      `iid`, no shared mutable state.
- [ ] Board full: the copy summon follows the engine's board-limit rule; no
      crash, no stuck choice.
- [ ] Silence: a silenced Grenadier has no discard trigger.
- [ ] Obliterate: no discard event and no trigger.
- [ ] Multiple Grenadiers: each discarded copy triggers independently.
- [ ] Discarding Grenadier as part of another cost does not loop infinitely.
- [ ] 2v2: the copy is summoned for the owner; the enemy's discard does not
      give the enemy the copy.
- [ ] Logs: discard choice is private; the summon is public.
- [ ] The test fails if the discard trigger or exact-copy path is removed.

### 3.4 Fading Memories (`01SI047`)

Printed: "Pick a follower. Create an Ephemeral copy of it in hand." Spell 0,
Burst.

- [ ] Play targeting an allied follower: copy in hand, Ephemeral, original
      unchanged, cost 0, Burst resolution.
- [ ] Play targeting an enemy follower: legal if the printed text allows any
      follower; assert the copy goes to the caster.
- [ ] Target a champion: rejected.
- [ ] Target a landmark: rejected.
- [ ] Target a follower in hand: rejected (if the rules require a unit in play).
- [ ] No follower in play: rejected; card stays in hand.
- [ ] Copy current stats/buffs/damage/keywords; assert the exact values.
- [ ] Attachments/equipment are not copied unless the rules say they are.
- [ ] Copy a token: legal; new card instance.
- [ ] Copy an Ephemeral follower: still Ephemeral.
- [ ] Copy a Barrier/SpellShield follower: keywords preserved as intended.
- [ ] Hand full: the copy burns; original remains; log is clear.
- [ ] New `iid`; original's `iid` and zone unchanged.
- [ ] Burst during combat: resolves immediately; no priority pass.
- [ ] Target leaves play before resolution: no copy, no stall (if a window
      exists).
- [ ] 2v2: any follower on either team is legal; copy goes to the caster.
- [ ] Logs: the chosen follower is private; public text is generic.
- [ ] The test fails if the copy-to-hand action is removed.

### 3.5 Batch 2a gates

- [ ] Focused file passes.
- [ ] Full `npm run test:all` passes.
- [ ] Lint 0 warnings.
- [ ] Coverage and cohort regenerated.
- [ ] Reckless 21/31 verified; 9 missing + Draven `auto`.
- [ ] Ravenous Butcher, Reborn Grenadier, Fading Memories curated with metadata.

---

## 4. Batch 2b — Play-as and alternate cost

Test file: `test/reckless-revenants-02.test.mjs`.

### 4.1 Play-as primitive

- [ ] Normal mode and alternate mode are both offered for a card that has them.
- [ ] The prompt identifies the player, the modes, and the costs.
- [ ] Cancel returns the card to hand with no mana/zone change.
- [ ] Alternate mode with insufficient mana is disabled/rejected; normal mode
      remains available if legal.
- [ ] Alternate mode with an illegal additional cost is disabled/rejected;
      normal mode remains available.
- [ ] Full cost package (base + alternate + additional) is validated before
      payment and paid exactly once.
- [ ] Alternate form enters with the correct card ID, type, stats, keywords,
      script, and owner.
- [ ] Equipment-to-unit alternate play does not attach to an ally and does not
      leave a duplicate equipment.
- [ ] Recall/transform/death of the alternate form uses the correct identity.
- [ ] `playable`/hand view accounts for both modes.
- [ ] 2v2 team scoping and owner/controller.
- [ ] Logs show the chosen mode without leaking hidden hand cards.

### 4.2 The Darkin Ballista (`06NX020`)

Printed: "You may spend 8 mana to play me as Naganeka of Zuretta." Equipment 1.
Associated: `06NX020T1` Naganeka 5/13 Overwhelm, "Round End: The Strongest enemy
and I strike each other."

- [ ] Normal play with 1 mana and a legal allied unit: attaches as Equipment;
      no unit is summoned; the ally is unchanged unless the equipment grants
      stats.
- [ ] Normal play with no allied unit: rejected; card stays in hand; no mana.
- [ ] Alternate play with exactly 8 mana and no ally: Naganeka enters as a
      5/13 Overwhelm unit; Ballista is not attached.
- [ ] Alternate play with 7 mana: unavailable/rejected; no mana paid.
- [ ] Normal play still works with 1 mana and an ally while the player has 8
      mana (both modes offered).
- [ ] Cancel at the mode prompt: no mana, card in hand.
- [ ] Priority/phase: unit play only on the controller's turn and not in
      combat; test rejected windows.
- [ ] Naganeka Round End with one enemy: the strongest enemy and Naganeka
      strike each other; assert damage and deaths.
- [ ] Naganeka Round End with no enemy units: no-op, no crash.
- [ ] Naganeka Round End with a tie for strongest: deterministic target.
- [ ] Naganeka dies to the strike: death/Last Breath resolves correctly.
- [ ] Enemy dies to the strike: death triggers resolve correctly.
- [ ] Both die: simultaneous death ordering.
- [ ] Overwhelm damage to the Nexus is correct if the enemy blocker dies.
- [ ] Silence removes Naganeka's Round End trigger.
- [ ] Recall/transform identity: the returned card is the correct form.
- [ ] 2v2: strongest enemy across both enemy players.
- [ ] Attach/detach/destroy-equipment interactions do not apply to Naganeka.
- [ ] The test fails if the alternate-form path or Naganeka's trigger is
      removed.

### 4.3 The Wings and The Wave (`04SI004`)

Printed: "Play: Play me as First Wave or Last Wind." Unit 1, 0/1.
Associated: `04SI004T2` First Wave 0/1, "When I'm summoned, summon a Prey";
`04SI004T1` Last Wind 3/3, "To play me, kill an ally"; `04SI014` Prey 0/1.

- [ ] Choose First Wave: First Wave enters 0/1; its summon trigger summons
      Prey; board has both; base card is gone.
- [ ] Choose Last Wind with a legal ally: kill the ally; Last Wind enters 3/3;
      mana 1 paid; the additional cost is not paid twice.
- [ ] Choose Last Wind with no ally: rejected/disabled; the player can cancel
      or choose First Wave; no mana/zone change.
- [ ] Cancel at the choice: base card stays in hand; no mana.
- [ ] Insufficient mana: neither mode is playable; card stays.
- [ ] Playable with 1 mana and no ally (First Wave is legal).
- [ ] First Wave with a full board: Prey summon follows the board-limit rule;
      no crash.
- [ ] Last Wind's kill cost triggers the ally's death/Last Breath before Last
      Wind enters; assert order.
- [ ] The chosen form's stats/keywords/cost are correct.
- [ ] Recall/transform identity: the returned card is the correct form.
- [ ] Silence: the chosen form's trigger is removed where applicable.
- [ ] 2v2: First Wave's Prey belongs to the controller; Last Wind can kill a
      partner's ally; enemy units are not legal.
- [ ] Logs: the choice is private until the form is public.
- [ ] The test fails if either form or the choice path is removed.

### 4.4 Batch 2b gates

- [ ] Focused file passes.
- [ ] Full suite passes.
- [ ] Lint 0 warnings.
- [ ] Reckless 23/31 verified; 7 missing + Draven `auto`.
- [ ] Ballista, Naganeka, Wings, First Wave, Last Wind, Prey all curated or
      explicitly blocked with a reason.

---

## 5. Batch 3a — In-deck state and countdown stages

Test file: `test/reckless-revenants-03.test.mjs`.

### 5.1 Deck-entry state

- [ ] Deck entries can carry mutable stats without losing the card ID.
- [ ] Save/load and migration preserve the new state.
- [ ] Draw, discard, toss, obliterate, and shuffle preserve the correct state.
- [ ] Copies are independent; mutating one deck entry does not mutate another.
- [ ] Deck order is deterministic under the test seed.
- [ ] A deck entry with modified stats displays the modified values in the
      player's own view and not in the opponent's hidden view, if applicable.

### 5.2 Go Hard (`03SI016`)

Printed: "Drain 1 from a unit. Create 2 copies of Go Hard in your deck. Every
third time this happens, transform all copies of me everywhere into Pack Your
Bags." Spell 1, Slow. Associated: `03SI016T1` Pack Your Bags 5, Slow, "Deal 5
to all enemies and the enemy Nexus. Transform all copies of me everywhere back
to Go Hard."

- [ ] Drain 1 on an allied unit: 1 damage, Nexus heals 1, target survives/dies
      correctly.
- [ ] Drain 1 on an enemy unit: same, controller's Nexus heals.
- [ ] Barrier: 0 damage, 0 heal.
- [ ] Tough: reduced damage, heal equals damage dealt.
- [ ] Overkill: heal equals full damage dealt, not remaining health.
- [ ] SpellShield: 0 damage, 0 heal.
- [ ] Lethal damage: target dies, death triggers resolve, heal is correct.
- [ ] Target a landmark: rejected.
- [ ] No unit: rejected; card stays in hand.
- [ ] Create 2 copies in deck: deck +2, correct card ID, hand unchanged.
- [ ] Deck order/shuffle is deterministic under the seed; assert counts, not a
      hard-coded position unless the engine defines it.
- [ ] First resolution: counter 1, no transform.
- [ ] Second resolution: counter 2, no transform.
- [ ] Third resolution: counter 3; all Go Hard copies in hand, deck, discard,
      and the resolving card's zone transform into Pack Your Bags; the two
      newly created copies also transform; no Go Hard copy remains.
- [ ] Counter is per player: player A's third resolution does not transform
      player B's copies.
- [ ] Counter is per card: other cards are unaffected.
- [ ] A countered Go Hard does not increment the counter or create copies.
- [ ] A discarded/milled/tossed Go Hard does not increment the counter.
- [ ] Pack Your Bags: 5 mana Slow; deal 5 to all enemy units and the enemy
      Nexus; deaths resolve; all Pack Your Bags copies transform back to Go
      Hard.
- [ ] Counter after Pack Your Bags: define and test whether it resets or
      persists.
- [ ] 2v2: "your deck" per player; "enemy Nexus" hits the correct team;
      counters are per player.
- [ ] Logs: deck copies are hidden; public text is generic.
- [ ] The test fails if the counter or transform-all path is removed.

### 5.3 Proliferating Darkwraith (`07SI013`)

Printed: "Last Breath: Create in deck an exact copy of your strongest
Proliferating Darkwraith in deck, then double the stats of Proliferating
Darkwraiths in deck." Unit 1, 1/1, Last Breath.

- [ ] Dies with one Darkwraith in deck: copy created in deck; all Darkwraiths
      in deck double; assert deck count and exact stats.
- [ ] Dies with multiple Darkwraiths: the strongest is chosen by the documented
      rule; tie-breaker deterministic.
- [ ] Strongest by attack vs health vs total stats: test the chosen definition.
- [ ] No Darkwraith in deck: no copy; no stat change; no crash.
- [ ] Dying Darkwraith is in discard, not deck; it is not the source of the
      copy.
- [ ] Exact copy preserves the deck entry's current stats/buffs.
- [ ] Doubling applies to the newly created copy if the printed order says
      create then double; assert the chosen interpretation.
- [ ] Odd stats double correctly; no rounding surprises.
- [ ] Deck order after creation is deterministic.
- [ ] Two Darkwraiths die simultaneously: resolve in order; the first changes
      the deck for the second; assert deterministic results.
- [ ] Silence: no Last Breath.
- [ ] Obliterate: no Last Breath.
- [ ] 2v2: "your deck" is the owner's deck; the copy belongs to the owner.
- [ ] Logs: hidden deck contents; public generic.
- [ ] The test fails if the in-deck copy or stat-doubling path is removed.

### 5.4 The Arena's Greatest (`09NX025`)

Printed: "I-II: Give an ally +2|+0 this round. III: Give an enemy Can't Block
this round." Landmark 1. Associated: `09NX025T2` Arena Spoils.

- [ ] Confirm and record the countdown length/stage schedule from the source
      before writing the test.
- [ ] Play the landmark; stage state is I.
- [ ] Round start advances to stage I/II; each stage gives an allied unit
      +2|+0 this round.
- [ ] Stage III gives an enemy Can't Block this round.
- [ ] The stage effect resolves before the landmark is destroyed on the final
      step.
- [ ] No legal ally at stage I/II: no-op with a log; no stall.
- [ ] No legal enemy at stage III: no-op with a log.
- [ ] The +2|+0 expires at round end; base stats restored.
- [ ] Can't Block expires at round end; the enemy can attack again next round.
- [ ] Destroy the landmark early: no later stage fires.
- [ ] Multiple landmarks: independent stage state.
- [ ] Copy/transform/recall of the landmark: state is correct or explicitly
      unsupported.
- [ ] 2v2: ally/enemy team scoping and target selection.
- [ ] Logs: public stage effect; no hidden hand info.
- [ ] The test fails if the stage schedule or either stage effect is removed.

### 5.5 Batch 3a gates

- [ ] Focused file passes.
- [ ] Full suite passes.
- [ ] Lint 0 warnings.
- [ ] Reckless 26/31 verified; 4 missing + Draven `auto`.
- [ ] Go Hard, Pack Your Bags, Darkwraith, Arena's Greatest, Arena Spoils
      curated or explicitly blocked.

---

## 6. Batch 3b — Revive and Shackled Ghasts

Test file: `test/reckless-revenants-03.test.mjs`.

### 6.1 Revive primitive

- [ ] Revive a dead allied unit from discard: it enters play with the correct
      stats/keywords; the discard count decreases; a revive event fires.
- [ ] Revive with no dead ally: rejected/no-op; no event.
- [ ] Revive with a full board: follows the board-limit rule; no crash.
- [ ] Revive an enemy unit: legal only if the effect says so; owner/controller
      correct.
- [ ] Revive is not a summon/play/recall; the test asserts which events fire.
- [ ] A revived unit's Last Breath is not re-triggered by the revive.
- [ ] 2v2: the reviving player's team and owner are correct.
- [ ] Logs: public revive; hidden discard choices are private.

### 6.2 Shackled Ghasts (`08SI003`)

Printed: "Last Breath: The next time you revive an ally, create a copy of me in
hand." Unit 1, 1/1, Last Breath.

- [ ] Ghasts dies; a delayed trigger is registered for its controller.
- [ ] No revive yet: trigger persists across the round and turn; no copy.
- [ ] Next revive of an ally: copy of Ghasts created in hand; trigger consumed.
- [ ] Second revive: no second copy from that Ghasts.
- [ ] Two Ghasts die: the next revive creates two copies; both triggers
      consumed.
- [ ] Failed/countered revive: trigger not consumed.
- [ ] Revive an enemy unit: does not consume the controller's trigger.
- [ ] Revive Ghasts itself: define and test whether its own trigger consumes
      and creates a copy.
- [ ] Revive during the same death batch: ordering is deterministic.
- [ ] Hand full: copy burns; trigger still consumed.
- [ ] Silence: no Last Breath, no trigger.
- [ ] Obliterate: no Last Breath, no trigger.
- [ ] Copy identity: card ID, 1/1, Last Breath, cost 1, new `iid`.
- [ ] 2v2: only the controller's revives consume the trigger; copy to the
      controller.
- [ ] Logs: hidden hand copy; public generic.
- [ ] The test fails if the delayed trigger or revive event is removed.

### 6.3 Batch 3b gates

- [ ] Focused file passes.
- [ ] Full suite passes.
- [ ] Lint 0 warnings.
- [ ] Reckless 27/31 verified; 3 missing + Draven `auto`.
- [ ] Shackled Ghasts curated; revive primitive documented.

---

## 7. Batch 4 — Champions and attacking summons

Test file: `test/reckless-revenants-04.test.mjs`.

### 7.1 Draven (`01NX020`)

Printed: "When I'm summoned or strike: Create a Spinning Axe in hand."
Level-up: "I've struck with 2+ total Spinning Axes." Unit 3, 3/3, QuickStrike.
Associated: `01NX020T1` Spinning Axe; `01NX020T2` Whirling Death; `01NX020T3`
level 2.

- [ ] Summon trigger creates exactly one Spinning Axe in hand.
- [ ] Strike trigger creates exactly one Spinning Axe in hand.
- [ ] Block, damage, targeted, and spell-strike events do not trigger the
      summon/strike clause unless the rules define them as strikes.
- [ ] A strike that kills the enemy still creates the Axe.
- [ ] A strike where Draven dies still creates the Axe if the trigger resolves
      before death; assert the policy.
- [ ] Multiple Draven copies trigger independently.
- [ ] Spinning Axe: 0-cost Burst; "To play, discard 1. Give an ally +1|+0 this
      round."
- [ ] Spinning Axe with a discardable card: discard paid; ally gets +1|+0;
      expires at round end.
- [ ] Spinning Axe with no discardable card: rejected; card stays in hand.
- [ ] Spinning Axe targeting an enemy: rejected (ally only).
- [ ] Spinning Axe cancel: no discard, no buff.
- [ ] Spinning Axe hand view/playable respects the discard cost.
- [ ] Level-up counter: 0 qualifying strikes; 1; 2 triggers level-up; 3 does
      not double-trigger.
- [ ] Ordinary strikes without Spinning Axe do not increment the counter.
- [ ] The second qualifying strike swaps to `01NX020T3`; current damage/health
      is preserved according to the engine's champion rules.
- [ ] Level 2 summon creates 2 Spinning Axes.
- [ ] Level 2 strike creates 2 Spinning Axes.
- [ ] Level 2 has QuickStrike and Overwhelm.
- [ ] Level-up fires once; no duplicate on later strikes.
- [ ] Whirling Death: target a battling ally and a battling enemy; the ally
      strikes; a Draven is created in the owner's deck.
- [ ] Whirling Death with no battling pair: rejected/no-op.
- [ ] Whirling Death is Fast; legality on the stack/combat is enforced.
- [ ] Deaths from Whirling Death resolve correctly.
- [ ] 2v2: battling pairs across teams; created Draven belongs to the caster.
- [ ] Champion copy limits and deck validation still pass.
- [ ] Logs: created Axe in hand is private; public text is generic.
- [ ] The test fails if the strike counter or Axe creation is removed.

### 7.2 Elise (`01SI053`)

Printed: "Attack: Summon an attacking Spiderling." Level-up: "Round Start: You
have 3+ other Spiders." Unit 2, 2/3, Fearsome. Associated: `01SI002`
Spiderling 1/1 Spider; `01SI053T1` Crawling Sensation; `01SI053T2` Spider Queen
Elise.

- [ ] Elise attacks: a Spiderling is summoned attacking in the same combat.
- [ ] The Spiderling is included in the attack and can be blocked/deal damage.
- [ ] Elise does not attack: no summon.
- [ ] Board full: the summon follows the board-limit rule; no crash.
- [ ] Attack canceled/removed before declaration: no summon.
- [ ] Spiderling has the SPIDER subtype, 1/1 stats, no keywords.
- [ ] Level-up at Round Start with 2 other Spiders: no level-up.
- [ ] With 3 other Spiders: level-up.
- [ ] With 4 other Spiders: level-up once.
- [ ] "Other" excludes Elise herself.
- [ ] Spider Queen Elise counts as a Spider.
- [ ] Spiderling tokens count.
- [ ] Non-Spider units do not count.
- [ ] Level 2 aura: other Spider allies gain Challenger and Fearsome.
- [ ] Elise herself does not receive the "other" aura; she has her printed
      keywords.
- [ ] Non-Spiders do not receive the aura.
- [ ] Aura recalculates on summon, death, transform, silence, recall, and
      equipment changes.
- [ ] Multiple auras stack without duplicating keywords.
- [ ] Enemy Spiders do not receive the aura.
- [ ] Crawling Sensation: if an ally died this round, summon 2 Spiderlings;
      create an Elise in the owner's deck.
- [ ] Crawling Sensation with no ally death: no summon/no create or the
      printed alternative; assert the chosen rule.
- [ ] Crawling Sensation with a full board: board-limit behavior.
- [ ] 2v2: attacking summons belong to the attacking team; Spider counts are
      per team; aura affects allied Spiders only.
- [ ] The test fails if the attacking summon, level-up, or aura is removed.

### 7.3 Champion cross-checks

- [ ] Level-up metadata is present and points to the correct level-2 card.
- [ ] The level-2 card has a script and verification metadata.
- [ ] Level-up preserves the correct state and does not heal/damage
      unintentionally.
- [ ] Champion copy limits are enforced in deck validation.
- [ ] A champion that leaves play and returns does not lose/duplicate its
      level-up state incorrectly.
- [ ] Game-over checks run after level-up and strike deaths.

---

## 8. Batch 5 — Equipment keyword support

Test file: `test/reckless-revenants-05.test.mjs`.

### 8.1 Fireth and Improvise (`06SI003`)

Printed: "When I'm summoned, I Improvise." Unit 1, 1/1, Ephemeral, Can't Block.

- [ ] Confirm and record the printed Improvise rule and the legal equipment
      pool before writing tests.
- [ ] Summon Fireth: the Improvise flow selects/creates the legal equipment and
      attaches it.
- [ ] The equipment is attached to Fireth, not another unit.
- [ ] If the rule is a choice, the prompt lists the legal pool; cancel is a
      no-op or follows the printed rule.
- [ ] If the rule is random, the fixed seed selects only from the legal pool.
- [ ] No legal equipment: no-op with a log; no crash.
- [ ] Board/equipment zone full: correct limit behavior.
- [ ] Fireth is Ephemeral and Can't Block; test both independently.
- [ ] Fireth dies: equipment detaches/returns/discards according to the
      equipment rules.
- [ ] Silence before/after summon: the summon trigger is removed.
- [ ] Detach/destroy equipment: Fireth's stats/keywords update correctly.
- [ ] 2v2: equipment belongs to the controller; enemy equipment is not legal.
- [ ] Logs: hidden pool/choice; public attach.
- [ ] The test fails if the Improvise/attach path is removed.

### 8.2 Blade Squire and Reforge (`03NX003`)

Printed: "Last Breath: Reforge." Unit 1, 2/1, Last Breath. Associated:
`03NX008` Heavy Blade Fragment (Overwhelm this round), `03NX010` Keen Blade
Fragment (Quick Attack this round), `03NX012` Glinting Blade Fragment (+2|+0
this round), `03NX011` Blade of the Exile (+2|+0, Overwhelm, Quick Attack
permanently).

- [ ] Confirm and record the printed Reforge rule and the fragment-combination
      rule before writing tests.
- [ ] Blade Squire dies normally: Reforge creates the correct fragment in hand.
- [ ] The fragment pool is exactly the three legal fragments; random selection
      under the fixed seed only picks from that pool.
- [ ] Fragment tracking is per player.
- [ ] Duplicate fragment behavior matches the printed rule.
- [ ] The set-completion point creates Blade of the Exile exactly once.
- [ ] Hand full: fragment/blade burn behavior is correct.
- [ ] Multiple Blade Squires: each Last Breath resolves independently.
- [ ] Silence: no Last Breath, no Reforge.
- [ ] Obliterate: no Last Breath, no Reforge.
- [ ] Heavy Blade Fragment: ally gains Overwhelm this round; expires.
- [ ] Keen Blade Fragment: ally gains Quick Attack this round; expires.
- [ ] Glinting Blade Fragment: ally gains +2|+0 this round; expires.
- [ ] Blade of the Exile: ally gains +2|+0, Overwhelm, and Quick Attack
      permanently; persists across round end.
- [ ] Each fragment/blade targets an ally only; no ally is rejected.
- [ ] 2v2: fragments and Blade belong to the caster; enemy targets rejected.
- [ ] Logs: hidden hand creation; public buff.
- [ ] The test fails if the fragment tracking or Blade creation is removed.

---

## 9. Phase 2.2 — Auto-script audit tests

Test file: `test/starter-auto-audit.test.mjs` (or append to the deck's existing
test file). Every card below must get a deterministic test that would fail if
the script were removed.

| Card | Required test details |
| --- | --- |
| `01FR004` Elixir of Iron | Ally target; +0\|+2 this round; round expiry; no target; permanent stats unchanged. |
| `01FR035` Unscarred Reaver | Survive damage triggers +3\|+0; lethal damage does not; Barrier/Tough; once per damage event; multiple hits. |
| `02BW020` Warning Shot | 1 to enemy Nexus; spell mana; no unit target; Nexus at 1/0; game-over check. |
| `02BW032` Gangplank | Summon creates Powder Keg; board space; Keg identity; Keg death. |
| `02BW047` Dreg Dredgers | Toss 3; deck under 3; toss count; toss triggers. |
| `02BW058` Jagged Butcher | Plunder on/off; +1\|+1 permanent; damage to enemy Nexus this round. |
| `03BW015` Crusty Codger | Play deals 2 to self; survives/dies; death/Last Breath ordering. |
| `03MT028` Solari Shieldbearer | Daybreak +0\|+4 this round; no Daybreak; round expiry. |
| `03MT048` Gift Giver | Summon creates Gem; hand full; card identity; cost. |
| `03MT054` Leona | Daybreak stuns strongest enemy; tie; no enemy; champion target. |
| `03MT073` Lunari Duskbringer | Summon creates Duskpetal Dust; hand full; identity. |
| `03MT088` Solari Soldier | Daybreak +1\|+1 this round; no Daybreak; round expiry. |
| `03MT092` Mountain Goat | Strike creates Gem; no strike; hand full. |
| `03MT094` Lunari Shadestalker | Nightfall grants Elusive; no Nightfall; permanent. |
| `04MT004` Blue Sentinel | Last Breath summons Crest of Insight; board space; identity. |
| `04MT013` Solari Sunhawk | Daybreak stuns strongest; tie; no enemy. |
| `04SH026` Dunekeeper | Summon summons Sand Soldier; board space; identity. |
| `04SH054` Treasure Seeker | Summon creates Waking Sands; hand full; identity. |
| `04SH079` Scrying Sands | Predict; give enemy -2\|-0 this round; no enemy; round expiry. |
| `04SH083` Feral Prescience | Predict; deck under 3; deterministic pick. |
| `05BC004` Otterpus | Summon creates Prank; hand full; identity. |
| `07BW003` Pocket Picker | Last Breath creates Coin; hand full; identity. |
| `07MT003` Cosmic Youngling | Round Start heals self and Nexus 1; damaged/full; game-over check. |
| `08PZ026` Galesong Call | Summons Galesong Swallow; board space; identity. |
| `09BC011` Gloomsprites | Strike grants Impact; no strike; permanent. |

Audit rules:

- [ ] The test uses the printed text, not the current `auto` script.
- [ ] If the `auto` script is an approximation, fix it or mark the card
      `partial`/blocked with a concrete reason; do not mark it `curated`.
- [ ] Add `verification` metadata with `test` pointing to the exact test name.
- [ ] Update the status to `curated` only when all clauses and edge cases pass.
- [ ] Re-run the cohort report; the `auto` count must reach 0.

---

## 10. Deck 3–6 — Triage and per-card tests

Before implementing any card in Frost & Flame, Tides of the Peak, Sands &
Secrets, or Runeterra Wanderers:

- [ ] Produce a triage table with ID, name, printed text, clause list,
      dependency, batch, and test file.
- [ ] Group by mechanic; identify shared primitives.
- [ ] Mark already-covered by an existing verified script.
- [ ] Mark blocked with a concrete dependency if needed.

For each card, apply the universal matrix in section 2. The minimum per-card
suite is:

- [ ] One test per printed clause.
- [ ] One no-target/no-resource test.
- [ ] One timing/ordering test.
- [ ] One zone/identity test.
- [ ] One keyword interaction test where relevant.
- [ ] One 2v2 team-scoping test where relevant.
- [ ] One regression test that fails without the script.

Deck exit tests:

- [ ] All text cards in the deck are `curated` or explicitly blocked.
- [ ] 0 `auto` and 0 `manual` in the deck.
- [ ] 10-round deterministic simulation with multiple seeds.
- [ ] No pending choices, unknown actions, engine warnings, negative
      mana/health, duplicate triggers, or orphaned delayed triggers.
- [ ] Coverage and cohort reports regenerated.

---

## 11. Cohort acceptance

- [ ] 179/179 starter text cards are `curated` or explicitly blocked.
- [ ] 0 `auto` and 0 `manual` in the starter cohort.
- [ ] Every distinct effect has a regression test that fails when the script is
      removed.
- [ ] Six deck simulations, 10 rounds each, at seeds 1, 42, and 1234:
  - [ ] Vanguard Disciplines.
  - [ ] Reckless Revenants.
  - [ ] Frost & Flame.
  - [ ] Tides of the Peak.
  - [ ] Sands & Secrets.
  - [ ] Runeterra Wanderers.
- [ ] Each simulation reaches a valid end or round 10 with no pending choice.
- [ ] Shared cards (Catch!, Fireth, etc.) have one coherent verification state.
- [ ] Coverage report shows the expected present/verified/missing counts.
- [ ] `docs/scripts/blocked.md` lists every blocked card with a concrete
      dependency.
- [ ] No release tag or artifact changed.

---

## 12. Release gates

These are separate from card tests. The current headless-only instruction means
items 2–8 are **not run**; record them as open, not failed.

1. Headless regression:
   - [ ] `npm run test:all`.
   - [ ] `npm run scripts:lint`.
   - [ ] `npm run build:seed`.
   - [ ] Package manifest/content checks.
2. Local two-instance full 1v1:
   - [ ] Host/join with a room code.
   - [ ] Ready, mulligan, start.
   - [ ] Play units/spells, pass priority, combat, Nexus damage.
   - [ ] Rematch.
   - [ ] Host close returns guest Home.
3. Local 2v2:
   - [ ] Team assignment and seat order.
   - [ ] Priority and targeting across teams.
   - [ ] Partner visibility and hidden information.
   - [ ] Surrender/rematch.
4. Spectator:
   - [ ] Join a room as spectator.
   - [ ] State filtering and hidden hands.
   - [ ] Leave without affecting the match.
5. Reconnect:
   - [ ] Mid-game data-channel loss.
   - [ ] Token rotation and resume.
   - [ ] Cancel returns Home.
6. Host departure:
   - [ ] Guest returns Home.
   - [ ] Room closes; no orphan process or listening port.
7. External network:
   - [ ] Two separate internet connections.
   - [ ] Host/join, full game, reconnect.
   - [ ] Record NAT/relay/TURN behavior.
   - [ ] Do not claim pass from a same-machine test.
8. Clean machine:
   - [ ] Fresh Windows account or VM.
   - [ ] Launch the portable artifact.
   - [ ] Data persistence across restart.
   - [ ] Clean shutdown.
9. Mulligan stall:
   - [ ] Reproduce with logs/state.
   - [ ] Identify the pending choice or deadlock.
   - [ ] Add a deterministic regression test.
   - [ ] Verify the fix in the full 1v1 flow.

Release artifact checks (only when cutting a release):

- [ ] Version and protocol metadata updated.
- [ ] README and `docs/testing.md` counts updated at release time.
- [ ] `npm run build:win` passes.
- [ ] Artifact size and SHA-256 recorded.
- [ ] Tag and release notes point to the matching commit.
- [ ] `v0.2.0` and `v0.3.0` remain untouched.
- [ ] Release notes state the open gates.

---

## 13. Evidence and reporting

Record for every batch:

- Date, agent, commit SHA, branch.
- Commands run and exact outputs.
- Syntax file count, lint entry count with 0 errors/0 warnings, test
  pass/fail counts.
- Coverage present/verified/missing.
- Starter cohort scripted/verified/missing.
- Card IDs and status changes.
- Blocked cards and the concrete dependency.
- Any test that was skipped and why (prefer none).
- Confirmation that no release tag or artifact changed.

Reporting rules:

- Never say "all cards work" because scripts exist.
- Never say "X% of the game works" because coverage is a percentage.
- Never claim external-network, relay, clean-machine, full 1v1, 2v2, spectator,
  or reconnect verification from local tests.
- Never call an `auto` script verified.
- Never hide a failed/blocked card in a passing count.
- Do not push with a red full gate.
