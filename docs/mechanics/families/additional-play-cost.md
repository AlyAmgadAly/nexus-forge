# Mechanic family — additional play costs

**Status:** draft — shared rulings pending
**Last updated:** 2026-10-27
**Cards in this batch:** `01SI011` Ravenous Butcher, `05NX006` Reborn Grenadier
**First future users:** `04SI004T1` Last Wind, `01SI057` Ancient Crocolith,
`01NX020T1` Spinning Axe, `01PZ039` Get Excited!

This is the shared spec for the "To play, ..." cost primitive. Card specs should
reference this file and document only their exceptions.

---

## 1. Definition

An **additional play cost** is a mandatory payment printed on a card that must
be made as part of playing the card from hand. It is not a trigger and not an
optional additional effect.

It differs from:

- **Mana cost** — the number in the top-left corner, paid from the mana pool.
- **Play trigger** — a "Play:" effect that resolves after the card is played.
- **Summon trigger** — a "When I'm summoned" effect that also fires for tokens,
  revives, and copies.
- **Alternate cost / play-as** — a different mode of playing the card, covered in
  batch 2b.

The cost is paid only on a play from hand. A card summoned, revived, copied into
play, or put into play by an effect does not pay it. See R-001 and R-042.

---

## 2. Universal rules

These rules apply to every additional play cost, regardless of the cost type.

| Rule | Specification | Ruling |
| --- | --- | --- |
| Scope | Only a play from hand. Not summon, revive, copy, or put into play. | R-001, R-042 |
| Mandatory | The player cannot choose to skip the cost. If it cannot be paid, the card cannot be played. | R-001 |
| Validation first | Validate timing, mana, and cost legality before any mutation. | R-002 |
| Atomic | A failed validation or cancellation leaves hand, mana, board, discard, stats, and triggers unchanged. | R-003 |
| No priority | The opponent cannot respond to cost payment. Cost-triggered abilities resolve immediately. | R-005, R-043 |
| Before entry | The cost is paid before the card enters play and before its play/summon triggers. | R-002 |
| Deterministic order | Cost-triggered events resolve to completion before the card enters play. | R-013, R-022 |
| Protection | The card being played cannot be discarded, burned, or killed by its own cost events. | R-004 |
| Board slot | The team reserves one board slot for the card being played. | R-004 |
| Visible legality | `handView` and `playable` reflect cost legality, or the play attempt returns a deterministic needs-cost response. | R-002 |
| 2v2 | "Ally" is team-wide for a kill cost; a discard cost uses the controller's own hand; the board limit is the shared team board. | R-006, R-040 |

---

## 3. Proposed payment pipeline

The exact order of mana versus the additional cost is awaiting R-002. The
proposed observable pipeline is:

1. **Validate** the play window, priority, mana, and cost legality.
2. **Pay mana.**
3. **Pay the additional cost** in printed order.
4. **Resolve cost events** (deaths, discards, summons from those triggers) to
   completion.
5. **Move the card from hand into play.**
6. **Fire play and summon triggers.**

The card is treated as "being played" from step 2 onward. It is protected from
hand-limit burn and from being chosen for its own discard cost. The team's board
slot is reserved from step 2 so a cost-triggered summon cannot fill the last
space.

If the game ends during step 4, the game-over state wins and the card does not
enter play (R-003, R-014).

---

## 4. Cost type — `killAlly`

**Used by:** `01SI011` Ravenous Butcher; `04SI004T1` Last Wind; `01SI057` Ancient
Crocolith (kill 2); `06SI007` The Darkin Halberd; `08SI015` Amalgamation of Vile
Rites; `08SI037` Spectral Ironhound.

### Legal targets

- Any allied unit on the controller's team.
- Champions, followers, and tokens.
- In 2v2, the partner's units are legal.
- Not enemy units, landmarks, equipment, spells, or cards in hand/deck/discard.
- The unit must be killable. An explicit "cannot die"/"unkillable" effect makes
  it illegal.

### Semantics

- It is a real death, not damage or obliteration.
- The unit leaves play and goes to the discard pile.
- Its Last Breath, death trigger, and ally-death watchers fire.
- Barrier, SpellShield, Tough, and Ephemeral do not prevent it.
- The dying unit's own trigger resolves before allied watchers, following the
  engine's existing death order.
- The kill has no unit source. The played card is not in play and is not the
  killer. "When I kill" on the played card does not trigger.

### Failure

- No legal ally -> reject the play.
- Only enemy units or only landmarks -> reject.
- All allies unkillable -> reject.
- Cancel before payment -> no-op.
- Board full before the play -> reject.
- Board filled by the cost's death trigger -> the reserved slot prevents it; see
  R-004 and R-014.

---

## 5. Cost type — `discard`

**Used by:** `05NX006` Reborn Grenadier; `01NX020T1` Spinning Axe; `01PZ039` Get
Excited!; `03PZ018` Poro Cannon; `05NX012` Roar of the Slayer.

### Legal choices

- Exactly one card from the controller's own hand.
- Any card type: unit, spell, landmark, equipment, champion, or token if the
  engine supports token cards in hand.
- The card being played is **not** a legal choice.
- The hand must contain at least one other card.
- In 2v2, only the controller's hand is used, not the partner's.

### Semantics

- It is a real discard: the card leaves hand, goes to the discard pile, and fires
  its own discard triggers and allied discard watchers.
- It counts for "discarded" effects.
- It is not hand-limit burn, not a deck mill, and not a move to another zone.
- The discard trigger resolves before the causing card enters play or resolves.
- If the discarded card summons a unit, that summon resolves before the played
  card enters play.

### Failure

- Hand contains only the card being played -> reject.
- Invalid card selection -> reject with no mutation.
- Cancel before payment -> no-op.
- Insufficient mana -> reject before discard.
- Board full when a discard trigger tries to summon -> the summon fails; the
  discard remains; see R-033.

---

## 6. Proposed DSL shape

This is an implementation proposal, not a ruling. The implementer may choose a
different shape if it preserves the behavior and passes lint.

A generic, composable cost object:

```json
{
  "playCost": {
    "all": [
      { "type": "mana" },
      { "type": "kill", "target": { "type": "allyUnit", "count": 1 } }
    ]
  }
}
```

For Reborn Grenadier:

```json
{
  "playCost": {
    "all": [
      { "type": "mana" },
      { "type": "discard", "amount": 1, "selection": "choose", "excludeSelf": true }
    ]
  }
}
```

For a future combined cost:

```json
{
  "playCost": {
    "all": [
      { "type": "mana" },
      { "type": "kill", "target": { "type": "allyUnit", "count": 1 } },
      { "type": "discard", "amount": 1, "selection": "choose" }
    ]
  }
}
```

Design constraints:

- Unknown cost types must be rejected by semantic lint.
- A cost type must declare whether it needs a target, a hand choice, or neither.
- A cost type must expose a legality check for `handView`/`playable`.
- A cost type must define its event order and how it is logged.
- The engine must be able to validate all costs before paying any of them.

---

## 7. Engine touch points

| Path | Work |
| --- | --- |
| `shared/script-vocabulary.js` | Add the cost type vocabulary and allowed fields. |
| `server/script-lint.js` | Reject unknown cost types, missing targets, invalid amounts, and unsupported combinations. |
| `server/engine/game.js` | Add the pre-play cost stage to `canPlay`, `playCard`, `handView`, and `playable`; add cost helpers; reserve the board slot; protect the played card. |
| `server/engine/effects.js` | Reuse `kill`, `discard`, and target selection where possible. |
| `docs/effect-dsl.md` | Document the `playCost` field and the payment order. |
| `test/reckless-revenants-02.test.mjs` | Add the batch 2a tests. |
| `scripts/batches/2026-10-27-reckless-revenants-02.json` | Batch source; apply with `scripts/apply-batch.mjs`. |

Do not hand-edit `data/scripts.json`.

---

## 8. Test matrix

Every additional-cost card needs at least these cases:

- [ ] Positive: pay the cost, card enters play, correct final state.
- [ ] No legal cost target/card: play rejected, no mutation.
- [ ] Invalid target/card: play rejected, no mutation.
- [ ] Cancel before payment: no mutation.
- [ ] Insufficient mana: play rejected before the cost.
- [ ] Cost event triggers a death/discard watcher: correct order.
- [ ] Cost event draws with a full hand: played card is not burned.
- [ ] Cost event summons with a full board: reserved slot protects the play.
- [ ] Board full before the play: rejected.
- [ ] Card is summoned/revived, not played: no cost.
- [ ] 2v2 partner target/copy ownership where relevant.
- [ ] The effect does not fire twice.
- [ ] The card leaves hand exactly once.
- [ ] Mana is paid exactly once.

Card-specific tests live in the card spec.

---

## 9. Future cards

The same primitive should clear these cards without a second mechanism:

- `04SI004T1` Last Wind — "To play me, kill an ally."
- `01SI057` Ancient Crocolith — "To play me, kill 2 allies."
- `01NX020T1` Spinning Axe — "To play, discard 1."
- `01PZ039` Get Excited! — "To play, discard 1."
- `01PZ001` Rummage — "To play, discard up to 2 cards."
- `01PZ027` Thermogenic Beam — "To play, spend all your mana."
- `05NX012` Roar of the Slayer — "To play, discard 1."
- `05NX003` Salt And Stitches — "To play, discard a card."
- `05BC079` Lil Dipper — "To play me, discard a unit."

The first batch implements only `killAlly` and `discard` (amount 1). Do not
generalize to "up to" or "spend all mana" until their specs are reviewed.

---

## 10. Open questions

| ID | Question | Ruling |
| --- | --- | --- |
| R-002 | Mana before or after the additional cost? | Open/proposed |
| R-004 | Hand and board protection during cost events | Open |
| R-006 | 2v2 partner units and hand scope | Project decision/proposed |
| R-012 | Source attribution for a cost kill | Open |
| R-014 | Board-full and game-over during a kill cost | Open |
| R-020 | Self-discard exclusion | Proposed |
| R-024 | Fleeting round-end discard and Ephemeral timing | Open |
| R-026 | Multiple simultaneous discards | Open |
| R-030 | Exact-copy snapshot for a discarded hand card | Open |
| R-033 | Board full when a copy is summoned | Open |
| R-043 | Stack/priority during a cost trigger | Proposed |

---

## 11. Change log

| Date | Change |
| --- | --- |
| 2026-10-27 | Created the additional-play-cost family spec for batch 2a: shared rules, payment pipeline, `killAlly` and `discard` cost types, proposed DSL shape, engine touch points, and test matrix. No behavior changed. |
