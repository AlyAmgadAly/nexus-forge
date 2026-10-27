# Mechanics dossier

**Status:** draft — rulings pending
**Last updated:** 2026-10-27
**Rules oracle:** user
**Implementing agent:** next coding agent

This directory is the behavioral source of truth for card mechanics. It turns
printed card text into clause-level specifications that an implementing agent
can code and test without re-deriving the rules.

It is **not**:

- a replacement for `data/cards.json`, which holds the card text and stats;
- a replacement for `docs/effect-dsl.md`, which holds the engine vocabulary;
- a replacement for regression tests;
- a claim that a card is implemented or verified.

A card is only **implementation-covered** when its script is curated, its
verification metadata is valid, and its regression test passes. A clause spec is
a prerequisite for that work, not evidence that the work is done.

---

## 1. Why this exists

Card text is compact and ambiguous. Two competent implementers can read the same
sentence and disagree about timing, legal targets, ownership, or what happens
when the board is full. Those disagreements become engine bugs that are expensive
to find later.

This dossier removes the ambiguity before code is written:

- one clause map per card;
- one global ruling log for words that repeat across many cards;
- one coverage index that shows what is drafted, reviewed, implemented, and
  verified;
- one template so every card is specified the same way.

The workflow is spec-first. The oracle reviews behavior; the agent implements
only behavior that has a ruling.

---

## 2. Source precedence

When sources disagree, use this order:

1. **Official card text for the target patch.** The local `data/cards.json` is a
   pinned Data Dragon payload. If the target patch is different, the oracle must
   supply the patch text and the delta must be recorded in the card spec.
2. **Official rulings and errata from the oracle.** These win over the agent's
   reading, the local card text, and existing engine behavior.
3. **Project decisions recorded in [rulings.md](rulings.md).** These include
   decisions already written into `docs/agents/implementation-order.md`.
4. **Existing engine conventions** in `docs/effect-dsl.md` and
   `server/engine/`.
5. **Nothing.** If the sources do not answer the question, add an open question
   and stop. Never silently infer a rule and never change expected behavior to
   match a convenient implementation.

A proposed ruling in this dossier is **not** an oracle ruling. It is the agent's
best reading, written down so the oracle can confirm or correct it quickly.

---

## 3. Status model

### Spec status

| Status | Meaning | May implementation start? |
| --- | --- | --- |
| `not drafted` | No clause spec exists. | No |
| `drafted` | Clause map exists; open questions are listed. | No |
| `in review` | Oracle is reviewing the draft. | No |
| `approved` | Oracle confirmed every blocking ruling. | Yes |
| `blocked` | Missing source, associated card, or engine capability. | No |

### Implementation status

| Status | Meaning |
| --- | --- |
| `missing` | No script entry. |
| `auto` | Machine-generated; not semantically verified. |
| `partial` | Covers some clauses only. |
| `curated` | Hand-authored, tested, and carries verification metadata. |
| `verified` | Curated and counted as verified by the coverage report. |
| `blocked` | Cannot be implemented without an engine or data dependency. |

### What "covered" means

- **Spec-covered:** the card's spec is `approved`.
- **Implementation-covered:** the card is `verified`.
- **Fully covered:** both.

Do not write "covered" without one of those qualifiers. A script entry, an
`auto` script, or a drafted spec is not coverage.

---

## 4. Directory map

| Path | Purpose |
| --- | --- |
| [README.md](README.md) | This guide: workflow, status, source precedence. |
| [card-spec-template.md](card-spec-template.md) | Reusable clause-spec template. |
| [rulings.md](rulings.md) | Global ruling log with stable IDs. |
| [coverage.md](coverage.md) | Which cards have specs and implementation status. |
| [cards/](cards/) | Per-card clause specs. |
| [families/](families/) | Shared mechanic-family specs. |

Related project documents:

- [Effect DSL](../effect-dsl.md) — what the engine can express today.
- [Implementation order](../agents/implementation-order.md) — batch sequence and
  engine dependencies.
- [Testing order](../agents/testing-order.md) — headless test matrix.
- [Manual in-game plan](../agents/manual-game-testing.md) — two-client plan, not
  executed.
- [Starter cohort](../scripts/starter-cohort.md) — generated script coverage.
- [Known blockers](../scripts/blocked.md) — card and release blockers.

---

## 5. Workflow

### 5.1 Draft

1. Pick a card or a mechanic family from [coverage.md](coverage.md).
2. Copy [card-spec-template.md](card-spec-template.md) to
   `cards/<cardId>.md`.
3. Fill the identity from `data/cards.json`. Use exact IDs and exact printed
   text. Do not paraphrase the printed text.
4. Read the relevant engine paths before mapping clauses: `server/engine/game.js`
   for play, cost, death, discard, summon, and priority; `server/engine/effects.js`
   for actions and targets; `server/script-lint.js` and
   `shared/script-vocabulary.js` for what the DSL accepts.
5. Map every clause to a trigger, condition, target, action, duration, zone, and
   owner.
6. List every ambiguity as an open question. Give it a ruling ID from
   [rulings.md](rulings.md) or a card-specific ID. Write the proposed answer and
   mark it `proposed`.
7. Mark the spec `drafted`.

### 5.2 Review

1. The oracle reviews the clause map and open questions.
2. Every blocking question is answered, deferred with a reason, or marked
   `blocked`.
3. Answers are recorded in [rulings.md](rulings.md) with the source and date.
4. The card spec is updated to `approved`.
5. No implementation starts before this gate.

### 5.3 Implement

1. Add the script through a batch file and `scripts/apply-batch.mjs`. Never
   hand-edit `data/scripts.json`.
2. Add one regression test per clause plus the negative and ordering cases from
   the spec.
3. Run `npm run test:all`.
4. Run the card-specific test file and the full suite.
5. Update the card spec's verification metadata and mark it `verified`.
6. Update [coverage.md](coverage.md).

### 5.4 Reopen

Reopen the spec when:

- the implementation reveals a rule the spec did not cover;
- the printed text or patch changes;
- a regression test contradicts the spec;
- a related card changes the shared mechanic;
- the oracle corrects a ruling.

Do not change behavior to make a test pass. Change the ruling first, then the
test, then the code.

---

## 6. Review gates

| Gate | Owner | Exit condition |
| --- | --- | --- |
| **R0 — identity and source** | Agent | Card ID, name, cost, stats, keywords, set, patch, and associated cards match the source. |
| **R1 — clause review** | Oracle | Every clause is mapped; every blocking open question is answered or explicitly deferred. |
| **I1 — implementation** | Agent | Script is in a validated batch; no hand-edited `scripts.json`; approved rulings are followed. |
| **V1 — verification** | Agent + oracle | Each clause has a passing test; negative, ordering, and 2v2 cases are covered where relevant; full gate is green. |
| **C1 — coverage** | Agent | Card spec, verification metadata, and coverage index agree. |

A card may be implemented before every non-blocking question is answered, but
the unresolved question must be recorded and the implementation must not guess.

---

## 7. What the rules oracle provides

The most useful input is not a wiki dump. It is a small set of authoritative
answers to specific questions.

| Resource | Why it matters | Preferred format |
| --- | --- | --- |
| Target patch and card text | The local data is pinned; the target patch may differ. | Patch number, date, and the exact card text if it changed. |
| Official rulings and errata | Settles timing, targets, zones, and exceptions. | Quote, source, and date. |
| Associated-card graph | Tokens, level-2 forms, and named associated cards are part of the card. | Exact card IDs and which form owns which trigger. |
| Golden sequences | A precise setup and expected result is worth more than a paragraph. | Board, hand, mana, action, expected board/hand/mana/trigger order. |
| Timecoded video | Shows trigger order and UI behavior that text misses. | Short clip per card, both boards and the log visible, expected result captioned. |
| 2v2 behavior | Team scope and ownership are easy to get wrong. | Confirm ally/enemy scope, hand ownership, board slots, and trigger owner. |
| Known bugs or exceptions | Prevents the agent from "fixing" intended behavior. | What looks wrong, what actually happens, and the intended rule. |

### Video guidance

A long VOD is hard to use. A short indexed clip is much better:

- one clip per card or mechanic;
- timecode and card ID in the title;
- both boards, the hand count, mana, Nexus, and the log visible;
- pause on the trigger order;
- caption the expected result;
- mark the clip `correct behavior` or `bug demonstration`;
- include the patch and deck code.

If the agent cannot watch the video reliably, extract the key frames and pair
them with the written ruling.

### What not to provide

- A giant uncurated wiki dump. The agent cannot tell which parts are current or
  relevant.
- Card text only. It is already in `data/cards.json`.
- Video only. Pair it with a written expected outcome.
- Conflicting sources without precedence. State which source wins.
- Implementation code in another language unless it maps directly to the DSL.
  Behavior is more useful than code.
- "Make it work like LoR" for an ambiguous case. Give the exact ruling.

---

## 8. Coverage rules

[coverage.md](coverage.md) is the index. Update it in the same commit that
changes a spec or a script status.

- A card with an `auto` script is **not** covered.
- A card with a `curated` script but no clause spec is **legacy verified**. It
  counts as implementation-covered but not spec-covered. Reopen it when its
  behavior is questioned or its batch is revisited.
- A drafted spec with open questions is **not** approved.
- A card with no script and no spec is **not drafted**.
- Do not mark a card verified from a manual observation alone. Verification
  requires the automated test and metadata.

Current measured script counts belong in `AGENTS.md` and the generated coverage
reports. This dossier tracks spec coverage and per-card status; it does not
replace the measured reports.

---

## 9. Adding a card

1. Add a row to [coverage.md](coverage.md) with status `not drafted`.
2. Copy the template.
3. Fill the identity and printed text.
4. Build the clause map.
5. Add open questions and proposed rulings.
6. Ask the oracle to review.
7. Record answers in [rulings.md](rulings.md).
8. Mark the spec `approved`.
9. Implement through a batch file.
10. Add tests.
11. Run the gate.
12. Mark the spec `verified` and update coverage.

If a card shares a mechanic with an existing family spec, link the family and
only document the card-specific exceptions.

---

## 10. Current batch

Batch 2a is the first dossier batch. It covers the additional-play-cost
primitive and the first copy-to-hand card.

| Card | Name | Spec | Implementation | Notes |
| --- | --- | --- | --- | --- |
| `01SI011` | Ravenous Butcher | [In review](cards/01SI011.md) | Missing | Kill-ally cost; R-004/R-012/R-014 confirmed; remaining rulings pending. |
| `05NX006` | Reborn Grenadier | [In review](cards/05NX006.md) | Missing | Discard cost and discard watcher; R-004/R-024/R-026/R-030/R-033 confirmed; remaining rulings pending. |
| `01SI047` | Fading Memories | Queued | Missing | Copy-to-hand; draft after the first two are approved. |

Shared family spec:
[additional-play-cost.md](families/additional-play-cost.md).

The batch is **not approved** and **not implemented**. Seven blocking rulings are
confirmed; the remaining standard rulings still need oracle confirmation before
the specs can move to `approved`.

---

## 11. Change log

| Date | Change |
| --- | --- |
| 2026-10-27 | Created the mechanics dossier: workflow, source precedence, status model, review gates, oracle input guide, coverage rules, template, rulings log, coverage index, batch 2a family spec, and the first two card specs. No card behavior changed. |
| 2026-10-27 | Oracle confirmed seven blocking rulings: R-004, R-012, R-014 for Butcher and R-004, R-024, R-026, R-030, R-033 for Grenadier. Both specs moved to `in review`; the remaining standard rulings are pending. No card behavior changed. |
