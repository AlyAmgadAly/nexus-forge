# Manual in-game test plan

Last updated: **2026-10-27**
Baseline commit: **c3f2541**
Status: **plan only — not executed**

Companion documents:

- [implementation-order.md](implementation-order.md) — ordered card-effect batches.
- [testing-order.md](testing-order.md) — exhaustive headless test design.
- [../testing.md](../testing.md) — release smoke test and external-network gate.
- [../scripts/blocked.md](../scripts/blocked.md) — known gaps and blockers.

---

## 1. Purpose and scope

This plan covers **manual, human-visible testing in the actual game**. It exists
because headless tests prove the rules engine, not the desktop UI, the two-client
wiring, the buttons, the animations, or the state the player actually sees.

This plan is for:

- local two-instance 1v1: lobby, mulligan, priority, passing, unit play, combat,
  blocking, spells, round end, lethal, rematch, leave;
- local 2v2: seats, shared board/Nexus/mana/token, separate hands, priority,
  targeting, surrender, rematch;
- local reconnect and host-departure behavior as adapter/UI smoke;
- a short visible-behavior check for each card batch after it is implemented.

This plan is **not**:

- a substitute for `npm run test:all`;
- a substitute for the per-card headless matrix in
  [testing-order.md](testing-order.md);
- proof of external-network, relay/TURN, clean-machine, or full release
  readiness;
- permission to claim a scenario passed when it was skipped, blocked, or only
  observed on one client.

### Current evidence status

Under the current headless-only instruction, **no manual in-game session has
been run**. Every scenario in this plan is **not run** until a human executes it
and records evidence. The automated suite is green, but that is engine evidence,
not in-game evidence.

Do not write "combat works" or "passing works" in a release note from this plan
until the P0 scenarios have recorded results.

---

## 2. Review and execution gates

### R1 — Plan review

Review this document before executing it.

- [ ] Scope and non-goals are unambiguous.
- [ ] The pre-flight names the exact build, commit, and two-instance setup.
- [ ] Every P0 scenario has numbered actions, exact expected results, and
      failure signatures.
- [ ] The passing/priority reference matches the engine's actual behavior.
- [ ] Known probes are labelled as probes, not as confirmed bugs or confirmed
      passes.
- [ ] Evidence fields and severity definitions are sufficient to file a useful
      bug.
- [ ] No step claims external-network, relay, clean-machine, or full 2v2
      verification from a local test.
- [ ] The owner has approved the scenario order and the stop conditions.

### I1 — P0 execution

- [ ] P0 scenarios 6.1–6.14 executed in order.
- [ ] Every result recorded in the evidence table.
- [ ] Every failure has a bug link or a documented blocker.
- [ ] No P0 failure is hidden inside a "pass" count.

### I2 — P1 execution

- [ ] P1 scenarios 6.15–6.18 executed.
- [ ] Keyword and summoning-sickness probes recorded.
- [ ] Local reconnect result recorded separately from external reconnect.

### I3 — 2v2 execution

- [ ] Scenario 6.19 executed with four players.
- [ ] Team, priority, targeting, partner visibility, surrender, and rematch
      results recorded.
- [ ] 2v2 evidence is not used to claim external-network verification.

### S — Sign-off

- [ ] All gates above are complete, or every open item is explicitly waived
      with a reason.
- [ ] The sign-off table is filled in.
- [ ] Release notes distinguish engine evidence, local in-game evidence, and
      unrun external gates.

### Execution workflow

1. The reviewer signs R1 before any scenario is executed.
2. The tester freezes the build and commit and completes the pre-flight.
3. Execute P0 in order. File each failure immediately; do not batch failures
   into a single end-of-session report.
4. Fixes land on `main`, the full headless gate reruns, and the affected P0
   scenario reruns from its setup step.
5. Execute P1, then P2.
6. Complete the per-scenario evidence and the sign-off table.
7. Update release notes only after the sign-off decision, and keep local
   in-game evidence separate from unrun external gates.

---

## 3. Ground rules

1. **One action per click.** Do not double-click to "make it work." Double
   clicks hide priority bugs and can create duplicate actions.
2. **Wait for both clients.** After every action, wait until both clients stop
   changing before judging the result.
3. **Check six surfaces after every click:**
   - priority and status line;
   - round and phase chip;
   - mana and spell mana;
   - hand count and board count;
   - Nexus health and unit stats/keywords;
   - the game log on both clients.
4. **If the clients disagree, stop.** Capture both screens and the log before
   doing anything else. A desync is a P0 failure.
5. **Use simple decks for the core loop.** Use Vanguard Disciplines on both
   sides by default because it is fully verified. Do not mix unverified card
   effects into the P0 loop.
6. **Do not test card text from memory.** For a card-specific smoke check, read
   the printed text from the card inspector or `data/cards.json`.
7. **One failure at a time.** File the bug, note the scenario, then decide
   whether the next scenario is independent enough to run.
8. **Freeze the build.** Do not change code during a manual session. If the
   build or commit changes, restart from the pre-flight.
9. **Never mark a skipped step as pass.** Use `blocked`, `not run`, or `fail`.
10. **No external-network claims from local loopback.** A local two-instance
    test proves the adapter and UI path only.
11. **Preserve evidence before restarting.** If the game stalls or desyncs, copy
    the log and take screenshots before closing the app.

---

## 4. Pre-flight

### 4.1 Repository and build

- [ ] `git branch --show-current` is `main`.
- [ ] `git status --short` is clean.
- [ ] `git pull --ff-only origin main` is up to date.
- [ ] `npm run test:all` passes: syntax files, lint entries, tests, 0 failures.
- [ ] The tested build and the tested commit are recorded.
- [ ] The build checksum is recorded if a packaged executable is used.
- [ ] `v0.2.0` and `v0.3.0` tags and `release/` artifacts are unchanged.

### 4.2 Two-instance setup

Use two instances with **separate data directories and separate Electron
profile directories**. Sharing either one invalidates the test.

The full commands are in [../testing.md](../testing.md) section 3. The shape is:

```powershell
$root = "$env:TEMP\nexus-forge-manual-test"

# Host instance
$env:NEXUS_DATA_DIR = "$root\host-data"
Start-Process -FilePath ".\release\NexusForge-0.3.0-portable.exe" `
  -ArgumentList "--user-data-dir=$root\host-profile"

# Guest instance, second terminal
$root = "$env:TEMP\nexus-forge-manual-test"
$env:NEXUS_DATA_DIR = "$root\guest-data"
Start-Process -FilePath ".\release\NexusForge-0.3.0-portable.exe" `
  -ArgumentList "--user-data-dir=$root\guest-profile"
```

Replace the executable name with the build under test. For the development
app, use `npm run desktop -- --user-data-dir="<path>"` with a separate
`NEXUS_DATA_DIR` for each instance.

- [ ] Host and guest use the same build and commit.
- [ ] Host and guest have different data directories.
- [ ] Host and guest have different profile directories.
- [ ] No other Nexus Forge process or old service port is still running.
- [ ] Both instances show the expected app version.

### 4.3 Session record

Record this before the first click:

| Field | Value |
| --- | --- |
| Date/time | |
| Tester(s) | |
| Build / commit | |
| SHA-256 | |
| Host OS / device / data dir | |
| Guest OS / device / data dir | |
| Network | local loopback |
| Host deck | |
| Guest deck | |
| App version | |

### 4.4 Default decks

Use **Vanguard Disciplines** on both sides for P0. It is the fully verified
starter deck, so a failure in the core loop is less likely to be confused with
an unimplemented card effect.

For a scenario that needs a keyword or stat line not present in that deck,
build a small controlled deck, record every card in it, and keep the rest of
the scenario unchanged. Do not use a card whose text is unverified to test the
core loop.

---

## 5. Test order and priority

| Order | ID | Scenario | Priority | Blocks sign-off |
| ---: | --- | --- | --- | --- |
| 1 | 6.1 | Host, join, and ready | P0 | Yes |
| 2 | 6.2 | Mulligan and round 1 | P0 | Yes |
| 3 | 6.3 | Pass-only round and priority | P0 | Yes |
| 4 | 6.4 | Play a unit | P0 | Yes |
| 5 | 6.5 | Unblocked combat | P0 | Yes |
| 6 | 6.6 | Blocked combat | P0 | Yes |
| 7 | 6.7 | Two attackers, one blocker | P0 | Yes |
| 8 | 6.8 | No legal blockers | P0 | Yes |
| 9 | 6.9 | Fast spell in combat | P0 | Yes |
| 10 | 6.10 | Slow spell rejection | P0 | Yes |
| 11 | 6.11 | Burst timing | P0 | Yes |
| 12 | 6.12 | Round-end and round-start cleanup | P0 | Yes |
| 13 | 6.13 | Lethal and game over | P0 | Yes |
| 14 | 6.14 | Rematch and leave | P0 | Yes |
| 15 | 6.15 | Keyword matrix | P1 | Conditional |
| 16 | 6.16 | Summoning-sickness probe | P1 | Conditional |
| 17 | 6.17 | Attack-token and priority edges | P1 | Conditional |
| 18 | 6.18 | Local reconnect | P1 | Conditional |
| 19 | 6.19 | Local 2v2 | P2 | Separate |
| 20 | 6.20 | External network and clean machine | P2 | Separate release gate |

Do not skip a P0 scenario because a later scenario looks easier. If a P0
scenario fails, file the bug and record whether the next scenario depends on
the broken behavior.

---

## 6. Detailed scenarios

### 6.1 Host, join, and ready

**Goal:** prove the room, seat, and lobby path before testing gameplay.

**Steps:**

1. Launch the host instance. Create a room.
2. Confirm the host receives a five-character room code.
3. Launch the guest instance. Join with the code.
4. Confirm the guest sees the lobby and the host's name.
5. Confirm the guest cannot see the host's saved decks, hand, admin token, or
   reconnect credentials.
6. Both players select a deck.
7. Both players mark ready.
8. The host starts the game.

**Expected:**

- Both clients enter the mulligan phase.
- Both clients show the same players and seats.
- The guest sees the filtered lobby, not the host's private data.
- The game does not start until both players are ready.

**Failure signatures:**

- Guest cannot join, or joins the wrong room.
- Host starts without the guest being ready.
- Guest sees host-only data.
- One client enters the game while the other remains in the lobby.
- A stale room from a previous test is still open.

**Evidence:** room code (redact before posting publicly), lobby screenshots,
player names, any error text.

---

### 6.2 Mulligan and round 1

**Goal:** prove the opening hand, mulligan replacement, first draw, mana, Nexus,
and attack token.

**Steps:**

1. Both players confirm they see **4 cards** during mulligan.
2. Player A selects one card and confirms the replacement.
3. Check that Player A still has 4 cards and that the deck count changed.
4. Player B keeps all 4 cards.
5. Both players lock in.
6. Wait for round 1 to begin.

**Expected:**

- Round 1 begins.
- Each player has **5 cards** in hand: 4 opening cards plus the round-start
  draw.
- Both teams have **1 mana** and 1 maximum mana.
- Both Nexuses are at **20** in 1v1.
- Both boards are empty.
- Exactly one team has the attack token.
- The team with the attack token has priority.
- Both clients show the same values.

**Failure signatures:**

- Hand is 4 or 6 instead of 5 after the round starts.
- A replaced card is not replaced, or the hand count changes.
- Mana is 0 or 2 in round 1.
- Both teams or neither team has the attack token.
- The mulligan does not advance after both players lock.
- One client starts the round before the other.
- The round counter is not 1.

**Evidence:** both mulligan screens, both round-1 screens, hand/deck counts,
mana, Nexus, attack token.

---

### 6.3 Pass-only round and priority

**Goal:** prove that one pass hands priority over and two passes end the round.

**Steps:**

1. Confirm the attack-token team has priority and the other team is on
   **WAIT**.
2. The active player clicks **PASS** once.
3. Check the log and both clients.
4. The other player clicks **PASS** once.
5. Wait for the round transition.

**Expected after the first pass:**

- The log records that the active player passed.
- Priority switches to the other team.
- The first player's button becomes **WAIT** or disabled.
- The opponent's **PASS** button becomes available.
- The round does **not** end yet.

**Expected after the second pass:**

- Both teams have passed with no stack.
- The round ends.
- Round 2 begins.
- Both teams have **2 maximum mana** and refill to 2.
- Each player draws 1 card.
- The attack token alternates to the other team.
- The round counter is 2.

**Failure signatures:**

- One pass ends the round.
- PASS does nothing, or the player remains on **WAIT** forever.
- Both pass but the round does not end.
- The round advances twice.
- The attack token does not alternate.
- One client shows a different priority, round, mana, or hand count.

**Pass-reset follow-up:**

1. In round 2, Player A passes.
2. Player B plays a unit instead of passing.
3. Check that Player A must pass again later; the earlier pass must not still
   count.
4. Both players pass with no stack. Confirm the round ends exactly once.

**Expected:** playing a card clears the earlier pass. The game does not end the
round on the strength of a pass that was made before the card was played.

**Evidence:** both clients after each pass, log lines, round counter, mana.

---

### 6.4 Play a unit

**Goal:** prove hand-to-board play, mana payment, and visible state on both
clients.

**Steps:**

1. The active player clicks a unit in hand.
2. If the unit requires a target, choose a legal target and confirm.
3. Wait for both clients to settle.
4. Check mana, hand count, board count, stats, keywords, and the log.
5. Both players pass to end the round.
6. Confirm the unit remains on the board in the next round.

**Expected:**

- Mana decreases by exactly the printed cost.
- The card leaves hand and a new unit appears on the board.
- The unit's attack, health, and keywords match the card.
- The opponent sees the unit and the same stats.
- The log records the play.
- The unit remains after the round ends.
- No summon or play trigger fires twice.

**Failure signatures:**

- Mana is wrong or negative.
- The card remains in hand or is duplicated.
- The unit appears on both boards or on the wrong side.
- The opponent sees different stats or keywords.
- The play trigger fires twice.
- The unit disappears at round end.

**Evidence:** before/after hand and board, mana, log, both clients.

---

### 6.5 Unblocked combat

**Goal:** prove attack declaration, the blocker step, the fast-spell window,
Nexus damage, and round transition.

**Setup:** the attacking team has the attack token and at least one ready unit.
The defending team has no blocker assigned for this attack.

**Steps:**

1. The attacking team clicks **ATTACK**.
2. Select one unit and confirm.
3. Check the defender's and attacker's screens.
4. The defender clicks **NO BLOCKS**.
5. Confirm the phase changes to **FAST SPELLS**; combat has not resolved yet.
6. The attacker clicks **PASS**.
7. The defender clicks **PASS**.
8. Wait for combat to resolve.
9. Check the Nexus, the attacker's state, and the round counter.

**Expected:**

- The defender sees **BLOCK** and **NO BLOCKS** during the blocker step.
- The attacker sees **WAIT** during the blocker step.
- **NO BLOCKS** advances to the fast-spell window; it does not resolve combat
  immediately.
- The attacker gets priority in the fast-spell window.
- Both passes resolve combat.
- The unblocked attacker deals its power to the enemy Nexus. A 2-power attacker
  takes the Nexus from 20 to 18.
- The attacker cannot attack again in the same round.
- In the current engine, resolved combat ends the round. The headless test
  `attack opens blockers, deals nexus damage, then ends the round` asserts this
  behavior. Confirm the round advances and the attack token alternates.

**Failure signatures:**

- Nexus damage happens before both players pass the fast-spell window.
- No damage happens.
- The round ends before combat damage.
- Damage is applied twice.
- The attack button remains available without the attack token.
- The attacker can attack twice in one round.
- The round does not advance after combat, or advances twice.
- One client shows a different Nexus value.

**Evidence:** both clients before the attack, during the blocker step, during
fast spells, and after damage; Nexus values; log.

---

### 6.6 Blocked combat

**Goal:** prove blocker assignment, simultaneous damage, deaths, and the
difference between a blocked and unblocked attack.

**Setup:** the attacker has one unit. The defender has a legal blocker.

**Steps:**

1. The attacker clicks **ATTACK**, selects one unit, and confirms.
2. The defender clicks **BLOCK**.
3. Assign one blocker to the attacker.
4. Confirm blocks.
5. Both players pass the fast-spell window.
6. Wait for combat to resolve.
7. Check both units' health, deaths, Last Breath triggers, and the Nexus.

**Expected:**

- A blocker can be assigned to only one attacker.
- The defender cannot assign an enemy unit as a blocker.
- Both units deal damage simultaneously unless the attacker has Quick Attack or
  Double Attack.
- A 2/2 attacker versus a 2/2 blocker: both deal 2 damage and both die.
- A 2/2 attacker versus a 1/3 blocker: the blocker goes to 1 health, the
  attacker goes to 1 health, both survive, and the Nexus takes no damage.
- A dead blocker still deals its damage in a simultaneous exchange. The engine
  snapshots power before the exchange.
- Last Breath fires once for a unit that dies.
- The Nexus is untouched unless the attacker has Overwhelm.

**Failure signatures:**

- Only one side deals damage.
- A dead blocker deals no damage in a simultaneous exchange.
- A blocker blocks two attackers.
- An enemy unit is accepted as a blocker.
- Damage happens before both players pass.
- Last Breath fires twice or not at all.
- The attacker or blocker remains at negative health.
- The Nexus takes damage despite a surviving blocker and no Overwhelm.

**Evidence:** attacker and blocker stats before/after, both clients, death log,
Last Breath log, Nexus.

---

### 6.7 Two attackers, one blocker

**Goal:** prove that blocking one attacker does not stop the other.

**Steps:**

1. Attack with two units.
2. The defender assigns the blocker to only one attacker.
3. Confirm blocks.
4. Both players pass the fast-spell window.
5. Check both attacker/blocker exchanges and the Nexus.

**Expected:**

- The blocked attacker and blocker exchange damage.
- The unblocked attacker hits the Nexus for its power.
- The blocker does not block both attackers.
- The Nexus damage equals the unblocked attacker's power only.
- Any deaths and Last Breath triggers resolve once.

**Failure signatures:**

- Both attackers are blocked by one blocker.
- Neither attacker hits the Nexus.
- The unblocked attacker deals damage twice.
- The wrong attacker is blocked.
- The Nexus damage includes the blocked attacker's power.

**Evidence:** attacker list, block assignment, both clients, Nexus, log.

---

### 6.8 No legal blockers

**Goal:** prove the engine skips the blocker step when the defender has no legal
blocker.

**Setup:** the defender has no units, or only units with **Can't Block**,
**Immobile**, or another restriction that makes every blocker illegal.

**Steps:**

1. Attack with at least one unit.
2. Watch the defender's screen.
3. If the game enters the fast-spell window directly, confirm that behavior.
4. Both players pass.
5. Check the Nexus damage and round transition.

**Expected:**

- The engine logs that no blockers are available.
- The blocker step is skipped.
- The phase goes to **FAST SPELLS** with the attacker holding priority.
- The defender is not asked to assign an illegal blocker.
- Both passes resolve combat and the unblocked attacker hits the Nexus.

**Failure signatures:**

- The game waits forever for a blocker that cannot exist.
- The defender is offered an illegal blocker.
- The game skips both the blocker step and the fast-spell window.
- Combat resolves without the required passes.
- The attack cannot be completed.

**Evidence:** defender's board, phase chip, both clients, log.

---

### 6.9 Fast spell in combat

**Goal:** prove stack timing during combat and the order of spell resolution
versus combat damage.

**Steps:**

1. Attack and resolve the blocker step (block or no blocks).
2. In the fast-spell window, the attacker plays a Fast spell.
3. Check that the spell goes on the stack.
4. Check that priority switches to the other team.
5. Both players pass.
6. Check that the spell resolves before combat damage.
7. Both players pass again.
8. Check that combat resolves.

**Expected:**

- The Fast spell can be played during combat.
- The spell goes on the stack and does not resolve immediately.
- Playing the spell clears earlier passes.
- Both passes resolve the top spell first.
- After the spell resolves, combat does not resolve automatically. Both players
  must pass again.
- After the spell resolves in combat, priority returns to the defending team.
- Combat damage happens after the spell's effect.
- The spell resolves exactly once.
- The spell's mana cost is paid exactly once.

**Failure signatures:**

- Combat resolves before the spell.
- The spell resolves twice.
- The spell resolves immediately like a Burst spell.
- Priority is skipped or stuck.
- The spell's effect is applied after combat damage.
- The game forgets that the spell was played.

**Evidence:** stack view, both clients after each pass, spell effect log,
combat damage, mana.

---

### 6.10 Slow spell rejection

**Goal:** prove a Slow spell cannot be played during combat or on a non-empty
stack.

**Steps:**

1. Enter the fast-spell window during combat.
2. Try to play a Slow spell from hand.
3. Check the card's appearance, the play attempt, mana, and the log.
4. Repeat in the main phase with a non-empty stack.

**Expected:**

- The Slow spell is not playable during combat.
- The card is dimmed or the play is rejected with a clear reason.
- No mana is spent.
- The card stays in hand.
- No stack item is created.
- The game does not enter a pending choice or stall.

**Failure signatures:**

- The Slow spell is accepted during combat.
- Mana is spent but the spell does not resolve.
- The card leaves hand and is lost.
- The stack accepts the spell, then the game stalls.
- The UI shows the card as playable when it is not.

**Evidence:** card state, mana, hand, stack, log, both clients.

---

### 6.11 Burst timing

**Goal:** prove a Burst spell resolves immediately and does not wait for passes.

**Steps:**

1. During combat, play a Burst spell.
2. Check that it resolves immediately.
3. Check that no stack item remains.
4. Check that combat still requires both players to pass before damage.

**Expected:**

- The Burst spell resolves immediately.
- Priority is not passed for the Burst spell itself.
- The effect is visible on both clients.
- Combat does not resolve until both players pass the fast-spell window.
- A Burst spell can be played in the legal combat window.

**Failure signatures:**

- The Burst spell goes on the stack and waits.
- The Burst spell resolves twice.
- Combat resolves before the Burst effect is applied.
- The Burst spell is rejected when it should be legal.
- The game skips the remaining combat passes.

**Evidence:** stack, effect log, combat damage, both clients.

---

### 6.12 Round-end and round-start cleanup

**Goal:** prove the per-round cleanup and the next-round setup.

**Setup:** create at least one visible round-limited effect, one Ephemeral unit,
one Fleeting card, and unspent mana.

**Steps:**

1. Note the current maximum mana, current mana, spell mana, hand size, and
   board state.
2. Both players pass with no stack.
3. Check the round transition.
4. Check the next round's mana, draw, attack token, buffs, keywords, and
   ephemeral/fleeting state.

**Expected:**

- The round ends exactly once.
- Maximum mana increases by 1, up to 10.
- Mana refills to the new maximum.
- Each player draws 1 card.
- The attack token alternates.
- Round-limited buffs expire.
- Temporary keywords expire.
- Ephemeral units die at round end.
- Fleeting cards are discarded at round end.
- Unspent mana becomes spell mana, capped at 3.
- Spell mana persists into the next round.
- No unit is healed, damaged, or moved unexpectedly.

**Failure signatures:**

- Maximum mana does not increase, or exceeds 10.
- Mana is not refilled.
- No draw, or two draws.
- The attack token does not alternate.
- A round buff becomes permanent, or a permanent buff is removed.
- An Ephemeral unit survives.
- A Fleeting card remains in hand.
- Spell mana exceeds 3 or is lost.
- The round advances twice.

**Evidence:** before/after mana, hand, board, buffs, keywords, log.

---

### 6.13 Lethal and game over

**Goal:** prove the win condition and the post-game block.

**Steps:**

1. Attack the enemy Nexus until it reaches 0. Use unblocked attacks.
2. Watch the Nexus value and the game-over transition.
3. Try to play a card or declare another attack.
4. Check the winner and the log.

**Expected:**

- Nexus health stops at 0, not negative.
- The game-over state appears.
- The correct team is declared the winner.
- No further cards, attacks, or passes are accepted.
- The log records the winning damage or the win reason.
- Both clients agree on the winner.

**Failure signatures:**

- Nexus goes negative.
- The game continues after 0.
- The wrong team wins.
- The winner is not shown.
- One client remains in the match while the other shows game over.
- A post-game action is accepted or crashes the game.

**Evidence:** Nexus before/after, game-over screen, both clients, log.

---

### 6.14 Rematch and leave

**Goal:** prove the post-game flow and cleanup.

**Steps:**

1. From game over, start a rematch.
2. Confirm both players return to mulligan with fresh hands, decks, mana, Nexus,
   and boards.
3. Finish or concede the rematch.
4. Leave the room.
5. Close the host instance.
6. Confirm the guest returns Home and no orphan process or listening port
   remains.

**Expected:**

- Rematch creates a fresh game, not a continuation of the old one.
- Old board state, buffs, counters, and pending choices are gone.
- Leaving the room returns both players to the correct screen.
- Host close returns the guest Home.
- No `Nexus Forge` or Electron process remains after both apps are closed.
- The local service port is closed.

**Failure signatures:**

- Rematch keeps old units, mana, Nexus damage, or pending choices.
- Rematch reuses the old game ID or old seat state incorrectly.
- Leaving the room leaves a ghost player.
- Host close strands the guest.
- A process or port remains after close.
- The next room cannot be created because the old room is still registered.

**Evidence:** rematch screen, fresh state, process list, port check, both
clients.

---

### 6.15 Keyword matrix

Run these as separate controlled scenarios. Record the exact card used and its
printed stats.

| Keyword | Setup | Expected | Failure signature |
| --- | --- | --- | --- |
| Quick Attack | Attacker with Quick Attack vs a normal blocker | Attacker strikes first. If the blocker dies, it does not strike back. | Blocker strikes back after dying. |
| Tough | Unit with Tough takes damage | Damage is reduced by 1 per instance. | Full damage is applied. |
| Barrier | Unit with Barrier takes its first damage | The first damage instance is negated, then Barrier breaks. | Damage gets through while Barrier is up, or Barrier never breaks. |
| Overwhelm | Attacker with Overwhelm vs a low-health blocker | Excess damage goes to the Nexus. A 5-power attacker vs a 2-health blocker deals 3 to the Nexus. | Excess damage is lost, or the full 5 is dealt to both. |
| Fearsome | Fearsome attacker vs a blocker with less than 3 power | The low-power blocker cannot block. | The low-power blocker is offered or accepted. |
| Elusive | Elusive attacker vs a non-Elusive blocker | The non-Elusive blocker cannot block. | The non-Elusive blocker is offered or accepted. |
| Can't Block | Unit with Can't Block | The unit never appears as a legal blocker. | The unit is offered or accepted as a blocker. |

Additional notes:

- **Challenger:** the engine has a challenger parameter, but the current UI may
  not expose a forced-block choice. If it does not, record that as a UI gap; do
  not force the block through another path unless the plan is updated.
- **Double Attack:** if a suitable card is available, verify it strikes twice
  and that the second strike does not duplicate unrelated triggers.
- **Lifesteal/Impact:** test only if a suitable card is available and the batch
  being reviewed claims support.

**Evidence:** exact card names, stats, blocker choices, damage before/after,
Nexus, log.

---

### 6.16 Summoning-sickness probe

**Status:** suspected gap; confirm intended behavior before treating a result
as a bug.

While reading the combat code, the `canAttack` check was found to verify the
attack token, priority, phase, stun, and keywords, but no check was found for
the round in which the unit was summoned. Standard Runeterra rules do not allow
a newly played unit to attack that turn unless an effect explicitly says so.

**Steps:**

1. The active team has the attack token and priority.
2. Play a unit with no effect that says it can attack immediately.
3. The opponent passes priority back to the active team.
4. The active team clicks **ATTACK** and tries to select the just-played unit.
5. Record whether the unit is selectable.
6. If it is selectable, attack with it and record the result.
7. Repeat with a unit that was already on the board before the round.

**Expected under standard rules:**

- The just-played unit cannot attack that turn.
- The unit that was already on the board can attack if it is otherwise legal.
- The game does not offer the just-played unit as a legal attacker.

**If the just-played unit can attack:**

- Record the sequence, the card, and the round.
- Mark it as a **rules probe failure**, not automatically a UI bug.
- Confirm whether the engine intentionally allows immediate attacks. If not,
  file it as a rules bug with the exact reproduction.
- Do not silently change the expected result to make the test pass.

**Evidence:** card, round, board history, attack selection, log.

---

### 6.17 Attack-token and priority edges

Run these checks in separate rounds.

- [ ] A team without the attack token does not see an **ATTACK** button.
- [ ] A team that already attacked this round cannot attack again.
- [ ] A team cannot attack while the stack is non-empty.
- [ ] A team cannot attack while the other team has priority.
- [ ] A stunned unit is not selectable as an attacker.
- [ ] An **Immobile** unit is not selectable as an attacker.
- [ ] A unit with **Can't Attack** is not selectable.
- [ ] A landmark is not selectable as an attacker.
- [ ] A unit cannot be selected twice in the same attack declaration.
- [ ] Canceling the attack selection returns to the previous state with no
      token spent and no unit exhausted.
- [ ] The attack token alternates after a completed round.
- [ ] A Scout/rally effect, if tested, does not duplicate the attack token or
      allow an illegal second attack.

**Evidence:** screenshots of the action bar and board, log, token state.

---

### 6.18 Local reconnect

**Goal:** prove the local adapter/UI reconnect path. This is not external
network verification.

**Steps:**

1. Start a local match and reach the playing phase.
2. Interrupt the guest's connection without closing the host.
3. Confirm the guest sees the reconnect overlay.
4. Restore the connection.
5. Confirm the guest returns to the same seat and the current filtered game
   state.
6. Repeat and choose **Cancel and leave**.
7. Confirm the guest returns Home and the host sees the correct disconnected
   state.

**Expected:**

- The reconnect overlay appears within the expected attempt window.
- Automatic reconnect restores the same seat and game state.
- The guest does not see the host's private hand or admin data.
- Cancel returns the guest Home.
- The host remains in the match until it decides to close or continue.
- No duplicate player or ghost seat appears.

**Failure signatures:**

- Reconnect joins a new seat or a new game.
- The guest sees a stale board or stale turn.
- The guest sees hidden information.
- Cancel leaves the guest stuck.
- The host cannot continue after the guest leaves.
- The room never closes.

**Evidence:** overlay screenshots, seat/player names, game state before/after,
host view, log.

---

### 6.19 Local 2v2

**Goal:** prove the 2v2 team model at the adapter/UI level. This is not a full
release verification.

**Setup:** four players, two teams, separate hands and decks, shared team board
and Nexus.

- [ ] Team assignment is correct in the lobby.
- [ ] Seat order is stable.
- [ ] Teammates share the board, Nexus, mana pool, and attack token.
- [ ] Each player keeps their own hand and deck.
- [ ] Either teammate can act when the team has priority.
- [ ] A teammate cannot see the partner's hand or private choices.
- [ ] Targeting an ally includes the partner's units.
- [ ] Targeting an enemy includes both opposing players' units.
- [ ] An attack by one teammate uses the team's shared token.
- [ ] Surrender and rematch behave correctly for the whole team.
- [ ] Hidden information is not leaked to the other team or a spectator.

**Failure signatures:**

- A teammate sees the partner's hand.
- A player can act for the wrong team.
- The team has two attack tokens or none.
- The board or Nexus is duplicated.
- Surrender leaves one teammate in the game.
- Rematch keeps old team state.

**Evidence:** four-client screenshots, team/seat list, hand visibility, token
state, surrender/rematch result.

---

### 6.20 External network and clean machine

These are **separate release gates**, not part of the local manual plan. Use
[../testing.md](../testing.md) section 5 for the external-network checklist and
section 4 for the packaged clean-machine smoke test.

- [ ] Two genuinely separate internet connections.
- [ ] Host/join, full game, reconnect.
- [ ] Record direct/relay/TURN behavior or `not exposed`.
- [ ] Fresh Windows account or VM for the packaged artifact.
- [ ] Data persistence across restart.
- [ ] Clean shutdown.

Do not claim any of these from a local loopback test.

---

## 7. Passing and priority reference

Use this table when a click does not produce the expected state.

| Situation | Action | Expected |
| --- | --- | --- |
| Main phase, no stack | Active team passes | Priority goes to the other team. The round does not end. |
| Main phase, no stack | Both teams pass | The round ends. |
| Main phase, non-empty stack | Both teams pass | The top stack item resolves. Priority reopens; both teams must pass again. |
| Main phase, after a card is played | Either team had passed earlier | The earlier pass is cleared. The other team gets priority. |
| Combat, blocker step | Defender clicks **NO BLOCKS** | The blocker step ends; the phase becomes **FAST SPELLS**; the attacker gets priority. Combat has not resolved. |
| Combat, blocker step | Defender clicks **BLOCK**, assigns blockers, confirms | The phase becomes **FAST SPELLS**; the attacker gets priority. |
| Combat, fast spells | Attacker passes | Priority goes to the defender. |
| Combat, fast spells | Both teams pass with no stack | Combat resolves; damage happens; the round ends. |
| Combat, fast spells | A Fast spell resolves | Priority returns to the defending team. Both teams must pass again before combat resolves. |
| Combat, fast spells | A Burst spell is played | It resolves immediately; combat still needs both passes. |
| Any phase | A pending choice is open | Passing must not skip the choice. Resolve the choice first. |
| Any phase | A player acts after the other passed | The pass count resets; the other team must respond or pass again. |

Button labels:

- **PASS** — you have priority and are declining to act.
- **WAIT** — the other team has priority, or a choice/state is resolving.
- **NO BLOCKS** — the defender declines to assign blockers. This advances to
  fast spells; it does not resolve combat immediately.
- **BLOCK** — the defender wants to assign blockers.
- **ATTACK** — the attack-token team wants to declare attackers.

If the label and the engine state disagree, record it as a UI/priority bug.

---

## 8. Known probes and decisions needed

| Probe | Why it matters | Current status | What to record |
| --- | --- | --- | --- |
| Summoning sickness | A just-played unit may be able to attack immediately. | Suspected gap; not confirmed. | Card, round, sequence, whether the unit was selectable. |
| Combat ends the round | The engine resolves combat, then calls `endRound()`. Standard LoR returns to the main phase. | Current engine behavior; confirm intended design. | Whether the round advanced, and whether the player expected a post-combat window. |
| Challenger forced block | The engine supports a challenger map; the UI may not expose it. | UI coverage unknown. | Whether a forced-block choice exists; if not, mark UI gap. |
| Mulligan stall | User-reported; not reproduced by automated tests. | Open investigation. | Round, phase, pending choice, both clients, log. Do not force-close before capture. |
| Card-specific manual smoke | Each batch needs a visible check, not only a headless script. | Per batch. | Card ID, printed text, action, result, test file. |

Do not turn a probe into a pass or a bug without recording the evidence and the
decision. If the design intentionally differs from standard Runeterra, record
the intended rule in `docs/effect-dsl.md` or the relevant design note.

---

## 9. Evidence and bug reporting

### 9.1 Per-scenario record

Copy this into the test issue or QA note for every scenario:

| Field | Value |
| --- | --- |
| Scenario ID / name | |
| Date/time | |
| Tester(s) | |
| Build / commit | |
| SHA-256 | |
| Host / guest | |
| Network | local loopback |
| Deck(s) | |
| Result | pass / fail / blocked / not run |
| Expected | |
| Actual | |
| Round / phase / priority | |
| Mana / hand / board / Nexus | |
| Both clients agree? | |
| Log lines | |
| Screenshots | |
| Bug link | |
| Notes | |

### 9.2 Bug report template

```text
Title: [Manual][Scenario] Short description

Severity: blocker / major / minor / cosmetic
Scenario:
Build / commit:
Host / guest:
Deck(s):
Round / phase / priority:

Steps:
1.
2.
3.

Expected:

Actual:

State snapshot:
- Mana (both teams):
- Hand count (both players):
- Board (both teams):
- Nexus (both teams):
- Attack token:
- Stack / pending choice:

Log lines:

Both clients agree? yes / no
Reproducible? always / sometimes / once
Screenshots / recordings:
Suspected area: engine / UI / network / unknown

Do not include reconnect tokens, admin tokens, IP addresses, or private hand
contents in a public issue.
```

### 9.3 Severity

- **Blocker:** prevents the match from starting, completing, or remaining in a
  consistent state; hidden-information leak; crash; desync.
- **Major:** a core rule is wrong (damage, priority, passing, block, lethal) but
  the match can continue.
- **Minor:** a visible but non-blocking error, wrong log text, or recoverable UI
  issue.
- **Cosmetic:** layout, wording, animation, or non-gameplay polish.

---

## 10. Review checklist

Use this before executing the plan and again before sign-off.

- [ ] Scope and non-goals match the release decision.
- [ ] The plan does not claim external-network, relay, clean-machine, or full
      2v2 verification.
- [ ] The build/commit/checksum fields are present.
- [ ] The two-instance setup uses separate data and profile directories.
- [ ] Vanguard Disciplines is the default P0 deck.
- [ ] Every P0 scenario has numbered steps, exact expected values, and failure
      signatures.
- [ ] The passing table covers main phase, stack, blocker step, fast spells,
      Burst, pending choices, and pass reset.
- [ ] The summoning-sickness probe is labelled as a probe, not a known bug.
- [ ] The combat-ends-round behavior is labelled as current engine behavior, not
      silently assumed to be standard.
- [ ] The keyword matrix uses exact, observable outcomes.
- [ ] The evidence table includes both clients and the log.
- [ ] The bug template excludes secrets and private data.
- [ ] The stop conditions are clear: desync, stall, hidden-information leak, or
      inconsistent state.
- [ ] All local links resolve.
- [ ] The owner has approved the plan.

---

## 11. Stop conditions

Stop the scenario and preserve evidence when:

- the two clients disagree on board, hand count, mana, Nexus, priority, or
  round;
- the game stalls on **WAIT** with no pending choice;
- a pending choice cannot be resolved;
- the mulligan does not advance;
- combat resolves without the required passes, or does not resolve after both
  passes;
- a unit or Nexus takes damage twice;
- a hidden hand, choice, token, or private card leaks to the other player;
- the game accepts an action after game over;
- a process, port, or room remains after closing.

For a stall or desync, capture the state **before** restarting. If the app must
be closed, note whether the state was recoverable after relaunch.

---

## 12. Definition of done

The manual in-game plan is complete when:

- [ ] R1 plan review is signed.
- [ ] I1 P0 scenarios have recorded results.
- [ ] I2 P1 scenarios have recorded results or documented blockers.
- [ ] I3 2v2 has recorded results or is explicitly deferred to the release
      track.
- [ ] Every P0 failure has a bug link or a documented waiver.
- [ ] No P0 blocker remains open for the local 1v1 claim.
- [ ] The evidence table is complete for every executed scenario.
- [ ] The sign-off table is filled in.
- [ ] Release notes distinguish local in-game evidence from unrun external
      gates.

## 13. Sign-off

| Gate | Owner | Date | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| R1 — plan review | | | | |
| I1 — P0 execution | | | | |
| I2 — P1 execution | | | | |
| I3 — 2v2 execution | | | | |
| S — final sign-off | | | | |

---

## 14. Change log

| Date | Change |
| --- | --- |
| 2026-10-27 | Created the manual in-game test plan with review gates, pre-flight, P0/P1/P2 scenarios, passing reference, probes, evidence templates, stop conditions, and sign-off. No in-game session has been run. |
