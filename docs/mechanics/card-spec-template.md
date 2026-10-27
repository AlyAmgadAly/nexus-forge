# {{CARD_ID}} — {{CARD_NAME}}

> **How to use this template:** copy this file to `cards/{{CARD_ID}}.md`, replace
> every `{{PLACEHOLDER}}`, and delete the instruction lines. Do not paraphrase the
> printed text. Do not mark the spec `approved` or `verified` yourself; those are
> oracle and gate decisions.

| Field | Value |
| --- | --- |
| Spec status | **{{not drafted / drafted / in review / approved / blocked}}** |
| Implementation status | **{{missing / auto / partial / curated / verified / blocked}}** |
| Verification | **{{none / test path#case}}** |
| Last updated | {{YYYY-MM-DD}} |
| Card text source | {{data/cards.json / patch URL / oracle text}} |
| Target patch | **{{patch number — oracle to confirm}}** |
| Rules oracle | {{name}} |
| Spec owner | {{agent or person}} |

---

## 1. Identity

| Field | Value |
| --- | --- |
| ID | `{{CARD_ID}}` |
| Name | {{CARD_NAME}} |
| Type | {{Unit / Spell / Landmark / Equipment / Champion}} |
| Supertype | {{Champion / none}} |
| Subtypes | {{subtypes or —}} |
| Region(s) | {{region(s)}} |
| Cost | {{cost}} |
| Attack / Health | {{attack}} / {{health}} |
| Keywords | {{keywords or —}} |
| Spell speed | {{Burst / Fast / Focus / Slow / —}} |
| Rarity | {{rarity}} |
| Set | {{set name (set code)}} |
| Collectible | {{yes / no}} |
| Associated cards | {{exact card IDs and names, or none}} |
| Level-2 form | {{card ID or —}} |
| Tokens / created cards | {{card IDs or —}} |

**Identity notes:** {{any mismatch between the local data, the target patch,
and the oracle's text. If there is no mismatch, say so.}}

---

## 2. Printed text

> {{exact printed text, preserving line breaks}}

**Text hash:** {{computed by apply-batch; do not invent}}
**Oracle-confirmed text:** {{yes / no / pending}}
**Patch delta:** {{none, or the exact difference from the local data}}

---

## 3. Clause map

Every printed sentence, and every separately timed part of a sentence, gets its
own clause. A clause is the smallest unit that can be implemented and tested
independently.

| ID | Printed phrase | Kind | Trigger / timing | Target | Action | Duration | Mandatory? | Spec status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | {{exact phrase}} | {{cost / trigger / static / aura / keyword / level-up}} | {{when}} | {{legal target}} | {{what happens}} | {{immediate / round / permanent}} | {{yes / no / player choice}} | {{proposed / confirmed / open}} |
| C2 | {{exact phrase}} | {{...}} | {{...}} | {{...}} | {{...}} | {{...}} | {{...}} | {{...}} |

**Clause count:** {{n}}
**Unmapped text:** {{none, or explain why a phrase is reminder text / flavor}}

---

## 4. Clause details

Repeat this section for every clause in the map.

### C{{n}} — {{short name}}

| Field | Specification |
| --- | --- |
| **Trigger** | {{play from hand / summon / discard / death / attack / round start / static / cost}} |
| **Timing** | {{before mana / after mana / before entry / after entry / on resolution / at round end}} |
| **Condition** | {{none, or the exact condition}} |
| **Cost** | {{none, or mana / killAlly / discard / spendAllMana / combined}} |
| **Target** | {{exact legal targets; include the target type and count}} |
| **Illegal targets** | {{exact exclusions}} |
| **Choice** | {{controller chooses / automatic / random / mandatory / optional}} |
| **Cancellable** | {{yes before payment / no / not applicable}} |
| **Action** | {{the effect, in engine terms}} |
| **Duration** | {{immediate / this round / permanent / until next round}} |
| **Zone** | {{hand / board / deck / discard / stack / anywhere}} |
| **Owner** | {{controller / card owner / caster / team}} |
| **Ordering** | {{what resolves before and after this clause}} |
| **Prevention** | {{what can and cannot prevent it}} |
| **Source / attribution** | {{which entity is the source for "when I kill" / "when you discard"}} |
| **Mandatory** | {{yes / no / player choice}} |
| **Repeatable** | {{once per event / once per turn / every time}} |
| **Logging** | {{public / private fields; what the opponent may see}} |

**What must not happen:**

- {{negative case 1}}
- {{negative case 2}}
- {{negative case 3}}

**Engine mapping:**

- Existing DSL vocabulary: {{actions / triggers / targets that already exist}}
- Missing vocabulary: {{what must be added}}
- Reuses primitive: {{existing helper or family spec}}
- Proposed script shape:

```json
{
  "{{trigger}}": {
    "{{field}}": "{{value}}"
  }
}
```

> The script shape is an implementation proposal, not a ruling. The implementer
> may choose a different shape if it preserves the specified behavior and passes
> lint.

---

## 5. Interactions

List the interactions that are easy to get wrong. Each row needs an expected
result, not just a topic.

| Interaction | Expected result | Ruling | Status |
| --- | --- | --- | --- |
| {{card + keyword/status}} | {{exact result}} | {{R-xxx}} | {{confirmed / proposed / open}} |
| {{card + death trigger}} | {{exact order}} | {{R-xxx}} | {{...}} |
| {{card + board full}} | {{exact result}} | {{R-xxx}} | {{...}} |
| {{card + hand full}} | {{exact result}} | {{R-xxx}} | {{...}} |
| {{card + 2v2 partner}} | {{exact result}} | {{R-xxx}} | {{...}} |

---

## 6. 2v2

| Question | Answer | Ruling |
| --- | --- | --- |
| What does "ally" mean? | {{controller only / controller + partner / team}} | {{R-xxx}} |
| What does "enemy" mean? | {{opposing team}} | {{R-xxx}} |
| Whose hand is used for a discard cost? | {{controller's hand only / team hand}} | {{R-xxx}} |
| Whose board is used for the board limit? | {{shared team board}} | {{R-xxx}} |
| Who owns the trigger? | {{card owner / controller / team}} | {{R-xxx}} |
| Who receives a created copy? | {{caster / owner / controller}} | {{R-xxx}} |
| What happens if a partner's unit is killed? | {{shared board; owner's death triggers}} | {{R-xxx}} |

If the card has no 2v2-specific behavior, say so explicitly. Do not leave the
section blank.

---

## 7. Golden tests

Each test must be deterministic. Give the exact setup, action, expected state,
and the negative case. The implementer turns these into `node:test` cases.

### G{{n}} — {{short name}}

**Setup:**

- P1 hand: {{card IDs}}
- P1 board: {{units, stats, keywords}}
- P1 mana: {{n}} (spell mana {{n}})
- P1 deck: {{relevant top cards or count}}
- P2 hand: {{card IDs}}
- P2 board: {{units, stats, keywords}}
- P2 mana: {{n}}
- Phase / priority / round: {{...}}
- RNG seed: {{seed, if randomness is involved}}

**Action:** {{exact sequence, including target selection and confirmation}}

**Expected:**

- {{board state}}
- {{hand state}}
- {{mana state}}
- {{discard / deck state}}
- {{trigger order, with the exact log order}}
- {{Nexus / stats / keywords}}
- {{what must not happen}}

**Why this test exists:** {{the clause or edge case it proves}}

### G{{n+1}} — {{negative / cancellation / ordering test}}

{{same structure}}

**Required coverage:**

- [ ] One positive test per clause.
- [ ] No legal target / no legal cost.
- [ ] Invalid target.
- [ ] Cancellation before payment.
- [ ] Insufficient mana.
- [ ] Board full.
- [ ] Hand full, if the card draws or creates.
- [ ] Trigger ordering with a death/discard/summon watcher.
- [ ] 2v2 partner and enemy scope, if the card is team-sensitive.
- [ ] Idempotence: the effect does not fire twice.

---

## 8. Open questions

Every question that blocks implementation must have an ID and a status. Link to
the global ruling if one exists.

| ID | Question | Proposed answer | Status | Blocks? | Oracle answer |
| --- | --- | --- | --- | --- | --- |
| {{R-xxx}} | {{question}} | {{proposed}} | {{open / proposed / confirmed}} | {{yes / no}} | {{to be filled}} |
| {{CARD-ID-OQ1}} | {{card-specific question}} | {{proposed}} | {{open}} | {{yes}} | {{to be filled}} |

**Blocking questions:** {{list the IDs that must be answered before I1}}
**Non-blocking questions:** {{list the IDs that can be answered during review}}

---

## 9. Engine mapping and gaps

| Need | Current state | Work required |
| --- | --- | --- |
| {{new trigger}} | {{exists / missing}} | {{none / add to vocabulary + lint + engine}} |
| {{new action}} | {{exists / missing}} | {{...}} |
| {{new target}} | {{exists / missing}} | {{...}} |
| {{new cost type}} | {{exists / missing}} | {{...}} |
| {{ordering hook}} | {{exists / missing}} | {{...}} |

**Touch points:**

- `shared/script-vocabulary.js` — {{...}}
- `server/script-lint.js` — {{...}}
- `server/engine/game.js` — {{...}}
- `server/engine/effects.js` — {{...}}
- `docs/effect-dsl.md` — {{...}}
- `test/{{file}}.test.mjs` — {{...}}

**Batch path:** `scripts/batches/{{date}}-{{name}}.json`
**Do not hand-edit:** `data/scripts.json`

---

## 10. Review checklist

- [ ] Identity matches `data/cards.json` or the oracle-supplied patch text.
- [ ] Every clause is mapped; no clause is hidden in a reminder phrase.
- [ ] The trigger is the printed trigger, not a convenient one.
- [ ] Cost timing is specified before the card enters play.
- [ ] Legal and illegal targets are exhaustive.
- [ ] Cancellation and failure leave no mutations.
- [ ] Death/discard/summon trigger order is specified.
- [ ] Board-full and hand-full behavior is specified.
- [ ] 2v2 ally/enemy/ownership behavior is specified.
- [ ] Negative tests are listed, not just positive tests.
- [ ] Open questions have IDs and statuses.
- [ ] No implementation started before R1.
- [ ] Oracle sign-off is recorded.

---

## 11. Verification metadata

Fill this only after the implementation and tests pass.

```json
{
  "version": 1,
  "cardTextHash": "{{computed by apply-batch}}",
  "verifiedAt": "{{ISO timestamp}}",
  "verifiedBy": "{{agent or reviewer}}",
  "test": "test/{{file}}.test.mjs#{{case-name}}",
  "clauses": [
    "{{clause 1}}",
    "{{clause 2}}"
  ],
  "notes": "{{anything the next reviewer must know}}"
}
```

**Verification gate:**

- [ ] `npm run test:all` passes.
- [ ] The card-specific test passes.
- [ ] The test name in the metadata exists.
- [ ] The card text hash matches.
- [ ] The coverage index is updated.
- [ ] The spec status is `verified`.

---

## 12. Change log

| Date | Change | Author |
| --- | --- | --- |
| {{YYYY-MM-DD}} | Created the clause spec. | {{author}} |
