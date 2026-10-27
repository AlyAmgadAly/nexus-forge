# Interrupted implementation audit — 2026-10-27

## Where work stopped

`AGENTS.md` is the gameplay automation plan; `ROADMAP.md` is the separate desktop
networking roadmap. The implementation had moved into the first starter deck
despite the gameplay ledger still saying Phase 2 had not started. Twelve batch
files and the Vanguard tests were present. The last edits added the declarative
`choose` action in the vocabulary, effect runner, and linter, but there were no
choice tests or Tellstones card scripts. That unfinished choice step is complete.
The full starter-deck phase remains incomplete.

## Findings and repairs

- **Choice integrity:** forged target/branch IDs and excess picks could advance a
  pending choice. The branch runner also fell back to the first option for an
  unknown ID. Invalid choices now leave the original prompt intact. Nested
  choices resume their branch and `then` actions exactly once. Choice options
  require distinct nonempty string IDs, labels, and nonempty valid actions.
- **Hidden information:** choice labels, created hand-card names, and hand buff
  names leaked through public logs even though the prompt itself was private.
  Owners retain the details; opponents and spectators receive generic log text.
  Private log metadata is removed from all returned views.
- **Independent unit state:** multiple Trusty Ramhounds shared a player-level
  first-Elite flag. `firstTimeThisGame` now supports `scope: "source"`; each
  Ramhound tracks its own first event. The existing controller scope remains the
  default. Tests cover simultaneous copies, later summons, and round persistence.
- **False verification:** Garen and Shen were curated without their printed
  level-up conditions. They are now partial. Semantic lint checks raw canonical
  `levelup` text as well as decorated `level2Id` data.
- **Authoring gates:** the batch tool did not pass card/status context into
  semantic lint and could report success after strict warning-only rejection.
  It now rejects both cases without writing. The lint CLI also exits unsuccessfully
  on warnings. The coverage walker now visits actions inside choice branches.
- **Stale tests:** four baseline failures assumed the old fixed script totals.
  Tests retain pinned card-dataset expectations and derive changing script/status
  totals from the loaded catalog. Vanguard fixtures no longer read local settings.

Added verified creation scripts for Demacian and Ionian Tellstones, testing all
six choices, Fleeting expiry, invalid picks, owner-only options, and private logs.
Added round-expiry/permanent-duration assertions to existing Vanguard tests.
Creation does not verify the generated spells' effects; see the blockers below.

## Current verification and limits

- Baseline: 157 tests, 153 passing and 4 stale-count failures.
- Final: `npm run test:all` passes 47 syntax checks, strict lint of 260 local
  script entries with zero errors/warnings, and all 167 tests. Tests are local
  and deterministic; no art downloads or external network tests were needed.
- Isolated CLI fixtures confirm a valid script exits 0 and a warning-only
  invalid event exits 1 without a misleading success message.
- Starter cohort regenerated: 179 text cards, 55 scripts, 21 verified, 124
  unscripted. Vanguard: 29 text cards, 21 verified, 2 partial, 6 unscripted.
- Resume edits changed exactly five card entries: Garen, Shen, Trusty Ramhound,
  Demacian Tellstones, and Ionian Tellstones. The existing custom script was
  preserved byte-for-byte at the entry level. Canonical cards, user decks,
  custom cards, and settings were not changed during the resume audit.
- Script merges used `scripts/apply-batch.mjs` with timestamped backups in
  `data/backups/`. Prior unrelated implementation and UI edits were preserved.

[Open dependencies](blocked.md) records the remaining Vanguard mechanics,
champion conditions, and generated-card gaps. [Starter cohort](starter-cohort.md)
contains the broader inventory. The gameplay phase/release gates have not been
met. No portable executable, seed release, commit, or push was produced here;
the previously built EXE therefore does not contain these fixes.
