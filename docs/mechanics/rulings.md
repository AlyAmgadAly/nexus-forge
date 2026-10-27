# Global rulings

**Status:** in review — seven rulings confirmed; remaining blocking rulings pending
**Last updated:** 2026-10-27
**Rules oracle:** user

This file is the shared decision log for words and timing that repeat across
cards. A card spec may add a card-specific question, but it should reuse a
global ruling whenever one exists.

A ruling is binding only when its status is `confirmed`. The other statuses are:

| Status | Meaning |
| --- | --- |
| `open` | No decision. Do not implement this behavior by guessing. |
| `proposed` | The agent's best reading, written for fast review. Not binding. |
| `project-decision` | Already recorded in `docs/agents/implementation-order.md` or another project document. The oracle may still override it. |
| `confirmed` | Oracle-approved. Safe to implement. |
| `superseded` | Replaced by a later ruling. Keep it for history. |

**How to confirm a ruling:** reply with the ruling ID and either "confirm" or the
corrected behavior. If a ruling is wrong, write the correct behavior and the
source (official ruling, patch note, or project decision). The agent will update
this file and every affected card spec.

---

## 1. Batch 2a review sheet

The fastest review path is to answer the blocking rulings for the two drafted
cards. The third card is queued and does not need review yet.

| Card | Review status | Spec |
| --- | --- | --- |
| `01SI011` Ravenous Butcher | Confirmed: R-004, R-012, R-014. Remaining: R-001, R-002, R-003, R-005, R-006, R-010, R-011, R-013, R-040, R-041, R-042, R-043. | [01SI011](cards/01SI011.md) |
| `05NX006` Reborn Grenadier | Confirmed: R-004, R-024, R-026, R-030, R-033. Remaining: R-001, R-002, R-003, R-005, R-006, R-020, R-021, R-022, R-023, R-025, R-031, R-032, R-040, R-041, R-042, R-043. | [05NX006](cards/05NX006.md) |
| `01SI047` Fading Memories | R-034, R-035, R-040, R-041, R-042, R-043. | queued |

The confirmed answers are recorded in the individual ruling sections below.
**The cards are not approved yet:** every remaining blocking ruling must be
confirmed or explicitly deferred before implementation starts.

If a ruling is not listed for a card, it does not block that card's
implementation.

---

## 2. Ruling summary

| ID | Topic | Status | Used by |
| --- | --- | --- | --- |
| R-001 | Definition and scope of an additional play cost | `proposed` | All "To play" cards |
| R-002 | Payment order for mana, costs, entry, and triggers | `proposed` | All additional-cost cards |
| R-003 | Cancellation and failure before/after payment | `proposed` | All additional-cost cards |
| R-004 | Hand and board protection during cost events | `confirmed` | 01SI011, 05NX006 |
| R-005 | Priority during cost payment | `proposed` | All additional-cost cards |
| R-006 | 2v2 scope of cost targets and hands | `project-decision` | 01SI011, 05NX006 |
| R-010 | Legal targets for "kill an ally" | `proposed` | 01SI011, kill costs |
| R-011 | Kill semantics and prevention | `proposed` | 01SI011, kill costs |
| R-012 | Source/attribution of a cost kill | `confirmed` | 01SI011 |
| R-013 | Death triggers versus the played card's entry | `proposed` | 01SI011 |
| R-014 | Board-full and game-over during a kill cost | `confirmed` | 01SI011 |
| R-020 | Discard-cost selection and self-discard | `proposed` | 05NX006, discard costs |
| R-021 | A cost discard is a real discard | `proposed` | 05NX006, discard costs |
| R-022 | Discard-trigger timing relative to the cause | `proposed` | 05NX006 |
| R-023 | Hand-limit burn is not discard | `project-decision` | 05NX006 |
| R-024 | Fleeting/round-end discard and Ephemeral timing | `confirmed` | 05NX006 |
| R-025 | Discard from zones other than hand | `proposed` | 05NX006 |
| R-026 | Multiple simultaneous discards | `confirmed` | 05NX006 |
| R-030 | "Exact copy" of a discarded hand card | `confirmed` | 05NX006 |
| R-031 | Ownership of the summoned copy | `project-decision` | 05NX006 |
| R-032 | The copy is a summon, not a play | `proposed` | 05NX006 |
| R-033 | Board full when the copy is summoned | `confirmed` | 05NX006 |
| R-034 | Fading Memories target scope | `project-decision` | 01SI047 |
| R-035 | Fading Memories copy snapshot and hand limit | `open` | 01SI047 |
| R-040 | 2v2 "ally" and "enemy" scope | `project-decision` | Team-sensitive cards |
| R-041 | 2v2 ownership, triggers, and shared counters | `open` | Team-sensitive cards |
| R-042 | Play versus summon and cost applicability | `proposed` | All "To play" cards |
| R-043 | Trigger resolution and priority during costs | `proposed` | All additional-cost cards |

---

## 3. Cost payment

<a id="r-001"></a>
### R-001 — Definition and scope of an additional play cost

**Question:** When does a "To play..." clause apply?

**Proposed ruling:** It is a mandatory additional cost paid only when the card is
played from hand. It does not apply when the card is summoned, revived, copied
into play, or put into play by an effect. It is part of playing the card, not a
`play` or `summon` trigger.

**Status:** `proposed`

**Basis:** Printed wording "To play"; `docs/agents/implementation-order.md` §6.1.

**Affects:** `01SI011`, `05NX006`, and every card with a "To play" cost.

**Note:** For a play-as / alternate form, confirm in batch 2b whether the
alternate form has its own cost and whether the base card's cost still applies.

---

<a id="r-002"></a>
### R-002 — Payment order for mana, costs, entry, and triggers

**Question:** In what order do mana payment, additional costs, hand departure,
entry, and triggered abilities resolve?

**Proposed ruling:** Resolve in this observable order:

1. Validate timing, mana, and cost legality.
2. Pay mana.
3. Pay the additional cost in printed order (for a single cost, choose the
   target or card now).
4. Resolve cost-triggered death/discard events to completion.
5. Remove the card from hand and put it into play.
6. Fire the card's play/summon triggers.

The card being played is protected from its own cost events (it cannot be
discarded, burned, or killed by them).

**Status:** `proposed`

**Basis:** `docs/agents/implementation-order.md` §6.1 says the cost is paid
before the card leaves hand and before it enters play. The exact order of mana
versus the additional cost needs oracle confirmation.

**Affects:** `01SI011`, `05NX006`, all additional-cost cards.

**Note:** If the oracle puts the additional cost before mana, the only observable
difference is a trigger that cares about mana spend. Record the order either way;
do not leave it implicit.

---

<a id="r-003"></a>
### R-003 — Cancellation and failure before/after payment

**Question:** What happens if the player cancels the play, or a cost becomes
invalid?

**Proposed ruling:** Before payment, cancellation is a no-op: hand, mana, board,
discard, stats, and triggers are unchanged. If validation fails, the play is
rejected with a deterministic needs-cost error and no mutation. After payment,
the play cannot be cancelled; it must resolve. If the game ends during cost
events, the game-over state wins and the card does not enter play.

**Status:** `proposed`

**Basis:** `docs/agents/implementation-order.md` §6.1 requires atomic payment
and no play/summon trigger on a rejected play.

**Affects:** `01SI011`, `05NX006`.

**Note:** The UI must not leave a pending choice after a cancel or rejection.

---

<a id="r-004"></a>
### R-004 — Hand and board protection during cost events

**Question:** Can cost-triggered draws burn the card being played? Can
cost-triggered summons fill the board and prevent the played card from entering
play?

**Confirmed ruling:** The played card is protected from hand-limit burn during
its own cost events; if a cost-triggered draw would burn a card, the drawn card
burns, not the played card. The controller's team reserves one board slot for the
played card before cost events resolve; a cost-triggered summon that would take
that reserved slot is not summoned and vanishes.

A full board before the play does not automatically reject a kill-cost card: the
mandatory kill frees a slot, so the played card can replace the killed ally. A
discard-cost card still needs an open slot because its cost removes no board
unit. Validate the final board state, not the pre-cost board count.

**Status:** `confirmed` (oracle, 2026-10-27)

**Basis:** Oracle ruling, 2026-10-27; consistent with the Last Breath rule in
R-014. The engine currently has no reservation or hand protection, so both must
be added.

**Affects:** `01SI011` (Last Breath summon), `05NX006` (discarding another
Grenadier).

**Note:** The reservation is one slot, not a replacement rule for arbitrary
board-full plays. Only a cost that actually removes a board unit frees a slot.

---

<a id="r-005"></a>
### R-005 — Priority during cost payment

**Question:** Can the opponent respond between choosing the cost target and
paying?

**Proposed ruling:** No. Cost payment is a single action with no priority window.
Triggered abilities caused by the cost resolve immediately, not on the stack.

**Status:** `proposed`

**Basis:** Standard Runeterra cost timing; the engine has no cost stack.

**Affects:** `01SI011`, `05NX006`, all additional-cost cards.

**Note:** If a cost trigger creates a spell or skill on the stack, see R-043.

---

<a id="r-006"></a>
### R-006 — 2v2 scope of cost targets and hands

**Question:** In 2v2, whose units and cards are legal for "kill an ally" and
"discard 1"?

**Proposed ruling:** "Ally" is any unit on the controller's team, including the
partner's units. Enemy-team units are illegal. "Discard 1" uses only the
controller's own hand, not the partner's. The shared team board is the board for
slot reservation.

**Status:** `project-decision` for ally scope; `proposed` for hand scope.

**Basis:** `docs/agents/implementation-order.md` §6.1.

**Affects:** `01SI011`, `05NX006`.

**Note:** Confirm whether a partner's unit can be killed by the other
teammate's cost, and whether the partner's "when an ally dies" triggers fire.

---

## 4. Kill costs

<a id="r-010"></a>
### R-010 — Legal targets for "kill an ally"

**Question:** What counts as an ally for `01SI011`?

**Proposed ruling:** Any allied unit on the controller's team: champions,
followers, and tokens. Landmarks, equipment, spells, units in hand/deck/discard,
and enemy units are illegal. The unit must be killable; an explicit "cannot
die"/"unkillable" effect makes it an illegal target.

**Status:** `proposed`

**Basis:** Standard Runeterra meaning of "ally" as a unit; `data/cards.json`
card types.

**Affects:** `01SI011`; `04SI004T1` Last Wind; `01SI057` Ancient Crocolith;
`06SI007` The Darkin Halberd; `08SI015` Amalgamation of Vile Rites; other kill
costs.

**Note:** Confirm that allied landmarks are never legal for this wording. Also
confirm whether a captured unit or a unit in a non-board zone can ever be
targeted (proposed: no).

---

<a id="r-011"></a>
### R-011 — Kill semantics and prevention

**Question:** Does a cost kill count as a death, and what prevents it?

**Proposed ruling:** Yes. The unit dies: it leaves play, goes to the discard
pile, and fires death, Last Breath, and ally-death watchers. Barrier, SpellShield,
Tough, and Ephemeral do not prevent a kill. Only an explicit "cannot die" or
"unkillable" effect does.

**Status:** `proposed`

**Basis:** Standard Runeterra kill versus damage; `markUnitDead()` in
`server/engine/game.js`.

**Affects:** `01SI011`, all kill costs.

**Note:** Confirm whether SpellShield prevents a kill cost (proposed: no; it
prevents enemy spells/skills, not a play cost). Confirm whether a champion's
death follows the normal champion rules.

---

<a id="r-012"></a>
### R-012 — Source/attribution of a cost kill

**Question:** Which entity is the source of the kill for "when I kill" or "when
you kill" triggers?

**Confirmed ruling:** No one is credited. The cost has no unit source; the
controller is not treated as the killer for "When you kill" triggers. "When I
kill" on the played card does not trigger, because the card is not in play. No
kill trigger fires from a cost kill.

**Status:** `confirmed` (oracle, 2026-10-27)

**Basis:** Oracle ruling, 2026-10-27. The engine attributes kills to a `source`
unit when one exists; a pre-play cost has no board source.

**Affects:** `01SI011`; Camavoran Dragon-style "when I kill" cards; any future
"when you kill" watcher.

**Note:** Do not credit the controller as a convenience. If a future card needs
"when you kill" to count cost kills, that is a new ruling.

---

<a id="r-013"></a>
### R-013 — Death triggers versus the played card's entry

**Question:** Do death and Last Breath triggers from the killed ally resolve
before the played unit is summoned?

**Proposed ruling:** Yes. Cost events resolve to completion before the card
enters play, then the card is summoned and its play/summon triggers fire. Event
order is deterministic and logged. The dying unit's own Last Breath resolves
before allied death watchers, following the engine's existing death order.

**Status:** `proposed`

**Basis:** `docs/agents/implementation-order.md` §6.1; `emitDeaths()` in
`server/engine/game.js`.

**Affects:** `01SI011`.

**Note:** If a death trigger wins the game, see R-014.

---

<a id="r-014"></a>
### R-014 — Board-full and game-over during a kill cost

**Question:** What if the killed ally's Last Breath fills the board, or the
death trigger ends the game?

**Confirmed ruling:** The played card reserves one board slot (R-004). If the
killed ally's Last Breath would fill that reserved slot, the Last Breath summon
is not put on the board and vanishes. The played card then enters play. The
vanishing summon does not fire summon triggers and is not placed in the discard
pile. If the game ends during cost events, the play stops and the card does not
enter play.

A board full before the play is not an automatic rejection for a kill-cost card:
the kill frees a slot. A board full before a discard-cost play still rejects
because no board unit leaves.

**Status:** `confirmed` (oracle, 2026-10-27)

**Basis:** Oracle ruling, 2026-10-27; the oracle cited gameplay video evidence
for the vanishing Last Breath summon.

**Affects:** `01SI011`; any future kill-cost card whose death trigger summons.

**Note:** The vanishing summon applies when there is no board space. Do not
return the summoned card to hand or put it in the discard pile as a death.

---

## 5. Discard costs and discard triggers

<a id="r-020"></a>
### R-020 — Discard-cost selection and self-discard

**Question:** How is "discard 1" selected, and can it discard the card being
played?

**Proposed ruling:** The controller chooses exactly one card from their own hand.
The card being played is not a legal choice. The hand must contain at least one
other card. Any card type is legal. The choice is mandatory and cancellable
before payment. Random discard and "first card" are not acceptable.

**Status:** `proposed`

**Basis:** `docs/agents/implementation-order.md` §6.1 requires specific-card
selection. Standard Runeterra does not let a card discard itself to pay its own
cost.

**Affects:** `05NX006`; Spinning Axe; Get Excited!; other discard costs.

**Note:** Confirm the self-discard exclusion explicitly. If the oracle allows it,
the play must be defined without a card left to resolve.

---

<a id="r-021"></a>
### R-021 — A cost discard is a real discard

**Question:** Is a discard paid as a cost a real discard?

**Proposed ruling:** Yes. The card leaves hand, goes to the discard pile, fires
its own discard triggers and allied discard watchers, and counts for
"discarded" effects. It is not obliterated and not burned.

**Status:** `proposed`

**Basis:** Standard Runeterra discard semantics; `discardCards()` in
`server/engine/game.js` dispatches a discard event.

**Affects:** `05NX006`, all discard costs.

**Note:** Distinguish from hand-limit burn (R-023) and from moving a card from
hand to deck, which is not a discard.

---

<a id="r-022"></a>
### R-022 — Discard-trigger timing relative to the cause

**Question:** When does "When I'm discarded" resolve relative to the card that
caused the discard?

**Proposed ruling:** Immediately after the discard event, before the causing card
enters play or resolves its effect. For a cost, this is before the played unit is
summoned. For a spell, this is before the spell's effect. The discard trigger is
not a stack item and cannot be responded to.

**Status:** `proposed`

**Basis:** `docs/agents/implementation-order.md` §6.1 says the discard trigger
resolves before the new unit's summon/play triggers.

**Affects:** `05NX006`; Salt and Stitches; other discard synergies.

**Note:** Confirm the Salt and Stitches sequence: discard Grenadier -> Grenadier's
copy is summoned -> Salt and Stitches summons a second Grenadier and buffs the
second one. See the card-spec open question.

---

<a id="r-023"></a>
### R-023 — Hand-limit burn is not discard

**Question:** Does a card burned from a full hand count as discarded?

**Proposed ruling:** No. Hand-limit burn is not a discard, and "When I'm
discarded" does not trigger. The burned card is removed according to the
engine's hand-limit rule, not placed in the discard pile as a discard.

**Status:** `project-decision`

**Basis:** `docs/agents/implementation-order.md` §6.1.

**Affects:** `05NX006`.

**Note:** Confirm the destination of a burned card (obliterated versus discard
pile). The trigger must not fire either way.

---

<a id="r-024"></a>
### R-024 — Fleeting/round-end discard and Ephemeral timing

**Question:** Does a Fleeting card discarded at round end trigger "When I'm
discarded"? If the trigger summons an Ephemeral unit during round-end cleanup,
does it die in the same cleanup?

**Confirmed ruling:** A Fleeting round-end discard is a discard and triggers
"When I'm discarded." Resolve round-end cleanup in this order: discard triggers
first, then Ephemeral deaths. The summoned copy is Ephemeral, so it is summoned
and then dies in the same round-end cleanup.

**Status:** `confirmed` (oracle, 2026-10-27)

**Basis:** Oracle ruling, 2026-10-27. The current engine logs Fleeting removal
without emitting a discard event and checks Ephemeral before removing Fleeting
cards; both must change to match this ruling.

**Affects:** `05NX006`.

**Note:** The copy's summon does not survive to the next round. If the board is
full, see R-033.

---

<a id="r-025"></a>
### R-025 — Discard from zones other than hand

**Question:** Does "When I'm discarded" trigger when the card is discarded from
the deck, obliterated, transformed, or moved to another zone?

**Proposed ruling:** No. Only a discard from hand triggers. Milling or
obliterating from the deck is not discard. Moving a card from hand to the deck
is not discard. Transform, capture, recall, and death are not discard.

**Status:** `proposed`

**Basis:** Standard Runeterra zone semantics.

**Affects:** `05NX006`.

**Note:** Confirm whether a card discarded from hand by any source (opponent
effect, cost, round-end Fleeting) triggers. Proposed: yes.

---

<a id="r-026"></a>
### R-026 — Multiple simultaneous discards

**Question:** If an effect discards two cards including two Grenadiers, in what
order do the copies summon?

**Confirmed ruling:** Each discarded card produces its own discard event. Resolve
them sequentially in the order the cards were discarded, including when an effect
discards multiple cards at once; log the order. All triggers resolve. If the
board fills, later summons fail under R-033.

**Status:** `confirmed` (oracle, 2026-10-27)

**Basis:** Oracle ruling, 2026-10-27. The engine's discard loop must preserve the
chosen order and drain each card's trigger before the next discard.

**Affects:** `05NX006`; effects that discard multiple cards.

**Note:** Do not batch the summons into one simultaneous insertion. Sequential
resolution is the rule.

---

## 6. Copy semantics

<a id="r-030"></a>
### R-030 — "Exact copy" of a discarded hand card

**Question:** What exactly does "exact copy" copy for `05NX006`?

**Confirmed ruling:** The copy uses the discarded card's ID and its current
hand-entry state at the moment of discard: current power/health, keywords, and
hand buffs. Round-duration buffs keep their duration and expire at round end;
they do not become permanent. A fresh unit is created at full health. Damage and
equipment do not carry because a hand card has none. Ephemeral and other keywords
do carry. Cost modifiers are not relevant to a summoned copy because it is not
played.

**Status:** `confirmed` (oracle, 2026-10-27)

**Basis:** Oracle ruling, 2026-10-27. The engine currently stores only card IDs
in the discard pile; the hand entry must be snapshotted through the discard
event.

**Affects:** `05NX006`; Fading Memories.

**Note:** Do not copy the base stats only. Do not make temporary buffs permanent.
If a hand buff has expired by the time the copy is summoned, it does not apply.

---

<a id="r-031"></a>
### R-031 — Ownership of the summoned copy

**Question:** Who gets the summoned copy when Grenadier is discarded by another
player?

**Proposed ruling:** The owner of the discarded card, not the player who caused
the discard. If an opponent discards your Grenadier, you summon the copy on your
board. If a teammate discards your Grenadier in 2v2, you get it.

**Status:** `project-decision`

**Basis:** `docs/agents/implementation-order.md` §6.1.

**Affects:** `05NX006`.

**Note:** Confirm the 2v2 teammate case explicitly.

---

<a id="r-032"></a>
### R-032 — The copy is a summon, not a play

**Question:** Does the copy pay the play cost or fire play triggers?

**Proposed ruling:** No. It is summoned directly. It fires summon triggers and
summon watchers, not play/playCard triggers, and pays no mana or discard cost.
A copy created in hand (for example by Fading Memories) is different: when it is
later played from hand, it is a normal play and pays its cost.

**Status:** `proposed`

**Basis:** `docs/effect-dsl.md` distinguishes `play` from `summon`;
`summonUnit()` in `server/engine/game.js`.

**Affects:** `05NX006`; Fading Memories copies.

**Note:** Confirm that "When I'm summoned" on the copied card fires, and that
"When I'm played" does not.

---

<a id="r-033"></a>
### R-033 — Board full when the copy is summoned

**Question:** What happens if the board is full when the discard trigger tries to
summon the copy?

**Confirmed ruling:** The summon fails; the discard remains; the copy is not
created and does not fire summon triggers. Log the failure. Do not return the
discarded card to hand and do not remove it from the discard pile.

**Status:** `confirmed` (oracle, 2026-10-27)

**Basis:** Oracle ruling, 2026-10-27. The engine's `summonUnit()` returns null
when the board is full; use that path and log it.

**Affects:** `05NX006`.

**Note:** The discarded card stays in the discard pile. The failed copy is not a
new card in any zone.

---

## 7. Fading Memories (queued)

<a id="r-034"></a>
### R-034 — Fading Memories target scope

**Question:** What can "Pick a follower" target?

**Proposed ruling:** Any follower in play, on either team, including tokens.
Champions, landmarks, spells, equipment, and cards in hand/deck/discard are
illegal. In 2v2, any follower on any team; the copy goes to the caster.

**Status:** `project-decision` for the in-play and team scope; `proposed` for
tokens.

**Basis:** `docs/agents/implementation-order.md` §6.2.

**Affects:** `01SI047`.

**Note:** Confirm enemy followers and tokens explicitly. Confirm whether
SpellShield or "cannot be targeted" prevents the spell.

---

<a id="r-035"></a>
### R-035 — Fading Memories copy snapshot and hand limit

**Question:** What does the copy in hand contain, and what if the hand is full?

**Proposed ruling:** A new card instance in the caster's hand with the follower's
current stats and keywords plus Ephemeral; the original is unchanged. Copy
current buffs. Damage, equipment bonuses, auras, temporary buffs, silence,
Barrier/SpellShield, and cost need explicit decisions. If the hand is full, the
copy burns; the original remains; the spell still resolves.

**Status:** `open`

**Basis:** `docs/agents/implementation-order.md` §6.2 lists the open questions.

**Affects:** `01SI047`.

**Note:** This is the biggest open area for the third card. Do not implement it
from a guess.

---

## 8. Timing, zones, and 2v2

<a id="r-040"></a>
### R-040 — 2v2 "ally" and "enemy" scope

**Question:** In 2v2, what do "ally" and "enemy" mean?

**Proposed ruling:** Team-based. "Ally" includes the controller and partner,
their units, and the shared board and Nexus. "Enemy" is the opposing team. Hands
and decks remain per player.

**Status:** `project-decision` for the team model; `proposed` for wording details.

**Basis:** `docs/agents/implementation-order.md` §6.1 and §6.2; the engine's
team-based board.

**Affects:** `01SI011`, `05NX006`, `01SI047`, all team-sensitive cards.

**Note:** Confirm whether a card that says "an ally" can target the partner's
units, and whether "your hand" ever means the team's hands (proposed: no).

---

<a id="r-041"></a>
### R-041 — 2v2 ownership, triggers, and shared counters

**Question:** Who owns triggers and copies in 2v2, and are "allies died" counters
team-wide or per player?

**Proposed ruling:** Triggers resolve for the card or unit's owner. Grenadier's
copy goes to the owner; Fading Memories' copy goes to the caster. The shared team
board is used for slots. "Allies died this round" counters are team-wide unless
the engine says otherwise.

**Status:** `open` for counters; `project-decision` for ownership.

**Basis:** `docs/agents/implementation-order.md` §6.1 and §6.2; engine team
structures.

**Affects:** `01SI011`, `05NX006`, `01SI047`; champion level-up conditions.

**Note:** This affects champion level-ups and any "you killed" or "allies died"
condition. Confirm before implementing team-sensitive cards.

---

<a id="r-042"></a>
### R-042 — Play versus summon and cost applicability

**Question:** Does a card put into play by an effect pay its "To play" cost?

**Proposed ruling:** No. Only a play from hand pays it. A revive, token summon,
copy summon, or effect that puts the card into play does not. A card played from
hand fires both play and summon; the cost is paid once.

**Status:** `proposed`

**Basis:** `docs/effect-dsl.md` and `summonUnit()`; `docs/agents/implementation-order.md`
§6.1.

**Affects:** `01SI011`, `05NX006`, all "To play" cards.

**Note:** Confirm that a card returned to hand and played again pays the cost
again (proposed: yes).

---

<a id="r-043"></a>
### R-043 — Trigger resolution and priority during costs

**Question:** Do cost-triggered abilities use the stack or priority?

**Proposed ruling:** No. They resolve immediately as part of the cost event,
before the card enters play or resolves. The opponent cannot respond. The engine
drains the event queue deterministically. If a cost trigger creates a spell or
skill on the stack, that stack resolves before the played card enters play.

**Status:** `proposed`

**Basis:** `docs/effect-dsl.md` event queue and `pump()` design.

**Affects:** `01SI011`, `05NX006`, all additional-cost cards.

**Note:** If the project wants a priority window, that is a major engine change.
Decide now, not after implementing the cards.

---

## 9. Change log

| Date | Change |
| --- | --- |
| 2026-10-27 | Created the global ruling log with 28 rulings for additional play costs, kill costs, discard costs and triggers, copy semantics, play-versus-summon, and 2v2 scope. No ruling is oracle-confirmed yet. |
| 2026-10-27 | Oracle confirmed R-004, R-012, R-014, R-024, R-026, R-030, and R-033. R-004 now distinguishes a kill cost freeing a slot, reservation of the played card's slot, and hand-limit protection. R-014 records that a Last Breath summon with no space vanishes. The remaining blocking rulings are still pending. |
