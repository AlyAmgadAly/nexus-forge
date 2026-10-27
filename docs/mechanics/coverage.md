# Mechanics coverage index

**Status:** in review — two specs in review; seven rulings confirmed; none approved
**Last updated:** 2026-10-27
**Scope:** Reckless Revenants batch 2a and the full Reckless deck inventory

This index tracks **clause-spec coverage** and pairs it with the current
implementation status. It does not replace the measured script reports in
`AGENTS.md`, `docs/scripts/starter-cohort.md`, or the release coverage report.

**Covered** is always qualified:

- **Spec-covered:** the spec is `approved`.
- **Implementation-covered:** the card is `verified`.
- **Fully covered:** both.

A script entry, an `auto` script, or a drafted spec is not coverage.

---

## 1. Summary

### Batch 2a

| Card | Name | Spec | Implementation | Verified | Blocking rulings |
| --- | --- | --- | --- | --- | --- |
| `01SI011` | Ravenous Butcher | **In review** | Missing | No | Confirmed: R-004, R-012, R-014. Remaining: R-001, R-002, R-003, R-005, R-006, R-010, R-011, R-013, R-040, R-041, R-042, R-043. |
| `05NX006` | Reborn Grenadier | **In review** | Missing | No | Confirmed: R-004, R-024, R-026, R-030, R-033. Remaining: R-001, R-002, R-003, R-005, R-006, R-020, R-021, R-022, R-023, R-025, R-031, R-032, R-040, R-041, R-042, R-043. |
| `01SI047` | Fading Memories | Queued | Missing | No | R-034, R-035 |

### Spec status counts

| Metric | Count |
| --- | ---: |
| Reckless text cards | 31 |
| Specs drafted | 0 |
| Specs in review | 2 |
| Specs approved | 0 |
| Specs queued | 1 |
| Specs not drafted — unverified (`missing` or `auto`) | 10 |
| Specs not drafted — legacy verified | 18 |
| Fully covered (approved + verified) | 0 |

### Implementation status counts

| Metric | Count |
| --- | ---: |
| Verified | 18 |
| Missing | 12 |
| `auto` (not verified) | 1 |
| Partial | 0 |
| Curated but not verified | 0 |

The Reckless deck is **18/31 verified**, with **12 missing** and **one `auto`
script** (`01NX020` Draven). This matches the current working-tree count in
`docs/agents/implementation-order.md`; the published 0.3.0 artifact is separate
and unchanged.

---

## 2. Full Reckless Revenants inventory

Rows are grouped by implementation state. "Legacy verified" means the card is
implementation-covered but has no clause spec yet; backfill is optional unless
the card is reopened.

### 2.1 Batch 2a — drafted or queued

| Card | Name | Type / cost | Family | Spec | Implementation | Verified | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `01SI011` | Ravenous Butcher | Unit 0, 3/2 | Additional play cost | **In review** | Missing | No | [Spec](cards/01SI011.md); kill-ally cost; R-004/R-012/R-014 confirmed. |
| `05NX006` | Reborn Grenadier | Unit 1, 3/2, Ephemeral | Additional play cost; discard watcher | **In review** | Missing | No | [Spec](cards/05NX006.md); discard cost; exact-copy summon; R-004/R-024/R-026/R-030/R-033 confirmed. |
| `01SI047` | Fading Memories | Spell 0, Burst | Copy-to-hand | **Queued** | Missing | No | Draft after the first two are reviewed. |

### 2.2 Remaining missing cards — no spec yet

| Card | Name | Type / cost | Family | Spec | Implementation | Verified | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `06NX020` | The Darkin Ballista | Equipment 1 | Play-as / alternate cost | Not drafted | Missing | No | Batch 2b; needs `06NX020T1`. |
| `04SI004` | The Wings and The Wave | Unit 1, 0/1 | Play-as | Not drafted | Missing | No | Batch 2b; Last Wind uses the kill-ally cost. |
| `03SI016` | Go Hard | Spell 1, Slow | Deck copies / transform | Not drafted | Missing | No | Batch 3a; per-card counter; `03SI016T1`. |
| `07SI013` | Proliferating Darkwraith | Unit 1, 1/1, Last Breath | In-deck copy / stat mutation | Not drafted | Missing | No | Batch 3a. |
| `09NX025` | The Arena's Greatest | Landmark 1 | Countdown stages | Not drafted | Missing | No | Batch 3a; confirm countdown length. |
| `08SI003` | Shackled Ghasts | Unit 1, 1/1, Last Breath | Revive / delayed trigger | Not drafted | Missing | No | Batch 3b. |
| `01NX020` | Draven | Champion 3, 3/3, QuickStrike | Strike trigger / level-up | Not drafted | **`auto`** | No | Batch 4; Spinning Axe cost; `01NX020T1`-`T3`. |
| `01SI053` | Elise | Champion 2, 2/3, Fearsome | Attack summon / level-up | Not drafted | Missing | No | Batch 4; Spiderling and level-2 dependencies. |
| `06SI003` | Fireth, Reaper of the Sands | Unit 1, 1/1, Ephemeral, Can't Block | Improvise / equipment | Not drafted | Missing | No | Batch 5; equipment pool. |
| `03NX003` | Blade Squire | Unit 1, 2/1, Last Breath | Reforge / fragments | Not drafted | Missing | No | Batch 5; Blade of the Exile chain. |

### 2.3 Legacy verified — no spec yet

These cards already have curated, verified scripts. They are implementation-covered
but not spec-covered. Do not reopen them just to fill the table; reopen when the
card is touched, questioned, or included in a new batch.

| Card | Name | Type / cost | Family | Spec | Implementation | Verified | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `01NX040` | Legion Saboteur | Unit 1 | Attack | Not drafted (legacy) | Verified | Yes | Existing test. |
| `07NX003` | All Out | Spell 1 | Buff/Grant | Not drafted (legacy) | Verified | Yes | Existing test. |
| `02SI006` | Barkbeast | Unit 1 | Buff/Grant | Not drafted (legacy) | Verified | Yes | Existing test. |
| `05SI011` | Burgeoning Sentinel | Unit 1 | Buff/Grant | Not drafted (legacy) | Verified | Yes | Existing test. |
| `07NX008` | Elegant Edge | Unit 1 | Buff/Grant | Not drafted (legacy) | Verified | Yes | Existing test. |
| `01SI022` | Mark of the Isles | Spell 1 | Buff/Grant | Not drafted (legacy) | Verified | Yes | Existing test. |
| `04NX019` | Thrashing Snapper | Unit 1 | Buff/Grant | Not drafted (legacy) | Verified | Yes | Existing test. |
| `06SI037` | Shadow Isles Tellstones | Spell 1 | Create/Summon | Not drafted (legacy) | Verified | Yes | Existing test. |
| `01SI045` | Absorb Soul | Spell 1 | Keyword | Not drafted (legacy) | Verified | Yes | Existing test. |
| `03SI015` | Pesky Specter | Unit 0 | Last Breath | Not drafted (legacy) | Verified | Yes | Existing test. |
| `01SI043` | Hapless Aristocrat | Unit 1 | Last Breath | Not drafted (legacy) | Verified | Yes | Existing test. |
| `01SI026` | Warden's Prey | Unit 1 | Last Breath | Not drafted (legacy) | Verified | Yes | Existing test. |
| `03SI003` | Stygian Onlooker | Unit 1 | Nightfall | Not drafted (legacy) | Verified | Yes | Existing test. |
| `01SI012` | Oblivious Islander | Unit 1 | Play | Not drafted (legacy) | Verified | Yes | Existing test. |
| `01NX049` | Guile | Spell 1 | Stun | Not drafted (legacy) | Verified | Yes | Existing test. |
| `04NX018` | Crimson Bloodletter | Unit 1 | Summon | Not drafted (legacy) | Verified | Yes | Existing test. |
| `01NX035` | Draven's Biggest Fan | Unit 1 | Summon | Not drafted (legacy) | Verified | Yes | Existing test. |
| `06NX041` | Crimson Pigeon | Unit 1 | Support | Not drafted (legacy) | Verified | Yes | Existing test. |

---

## 3. Global context

| Metric | Value | Source |
| --- | ---: | --- |
| Starter cohort text cards | 179 | `docs/agents/implementation-order.md` |
| Starter cohort scripted | 73 | Same |
| Starter cohort verified | 47 | Same |
| Starter cohort missing | 106 | Same |
| Full catalog collectible scripts present | 282 | `AGENTS.md` §4 (working tree) |
| Full catalog collectible verified | 56 | Same |
| Full catalog collectible missing | 1,270 | Same |
| Published 0.3.0 scripts | 270 | `docs/scripts/coverage-0.3.0.md` |
| Published 0.3.0 verified | 38 | Same |

The published artifact is intentionally listed separately. Do not mix its counts
with the working tree.

---

## 4. Next specs

| Order | Card | Why | Depends on |
| ---: | --- | --- | --- |
| 1 | `01SI047` Fading Memories | Completes batch 2a; copy-to-hand primitive. | R-034, R-035 |
| 2 | `06NX020` The Darkin Ballista | Batch 2b; play-as and alternate cost. | Batch 2a cost hook |
| 3 | `04SI004` The Wings and The Wave | Batch 2b; play-as and Last Wind kill cost. | Batch 2a cost hook |
| 4 | `03SI016` Go Hard | Batch 3a; deck copies and transform-all-copies. | Batch 2a copy semantics |
| 5 | `07SI013` Proliferating Darkwraith | Batch 3a; in-deck copy and stat mutation. | Copy semantics |
| 6 | `09NX025` The Arena's Greatest | Batch 3a; countdown stages. | Countdown length ruling |
| 7 | `08SI003` Shackled Ghasts | Batch 3b; revive and delayed trigger. | Revive primitive |
| 8 | Champions and equipment | Batch 4 and 5; keep last. | Level-up, Improvise, Reforge |

---

## 5. How to update this index

1. Change the card's spec status in the same commit as the spec.
2. Change the implementation status only when `data/scripts.json` actually
   changes through `scripts/apply-batch.mjs`.
3. Change `Verified` only when the verification metadata is valid and the test
   passes.
4. Add a row for a new card when its spec is drafted, not when it is first
   discussed.
5. Keep the summary counts consistent with the tables.
6. Do not copy measured counts from a release artifact into the working-tree
   columns.

---

## 6. Change log

| Date | Change |
| --- | --- |
| 2026-10-27 | Created the coverage index. Two specs drafted (`01SI011`, `05NX006`); one queued (`01SI047`); no spec approved; no new implementation. Reckless remains 18/31 verified, 12 missing, one `auto`. |
| 2026-10-27 | Oracle confirmed seven blocking rulings: R-004, R-012, R-014 for Butcher and R-004, R-024, R-026, R-030, R-033 for Grenadier. Both specs moved to `in review`; neither is approved and no card was implemented. Reckless remains 18/31 verified, 12 missing, one `auto`. |
