# Nexus Forge 0.3.0

Released 27 October 2026.

## Artifact

- File: `NexusForge-0.3.0-portable.exe`
- Size: 121,460,358 bytes
- SHA-256: `3E9EAD7832C7ABE9CB61E2B9CA914447966290030609C8169E4904AD79798C9A`
- Platform: Windows x64 portable executable
- Signing: unsigned; Windows SmartScreen may warn on first launch
- Node.js: not required

The executable contains the Electron app, local service, pinned card data, and
the 0.3.0 seed scripts. User data stays in the per-user data directory and is
not stored inside the executable.

## What changed

- **Vanguard Disciplines is complete.** All 29 text cards in the starter deck
  are scripted, tested, and verified. The deck has 0 missing and 0 partial cards.
- **Garen and Shen level up.** Both champions now have their printed level-up
  conditions, level-two scripts, and regression tests.
- **19 curated entries were added** from
  `scripts/batches/2026-10-27-vanguard-batch-01.json`: 14 collectible Vanguard
  text cards plus 5 generated or level-2 cards.
- **New engine primitives** support the batch: equip-from-hand with ownership
  and cost filtering, filtered top-deck picks, capture/release, allied swaps,
  next-summon buffs, counters, unit and hand transforms, hand-card keywords, and
  the event/condition helpers those cards need.
- `rally()` now clears the opposing team's attack token.
- App version is `0.3.0`; protocol version remains `1`.

## Card-effect coverage

| Metric | Value |
| --- | ---: |
| Text cards in the pinned catalog | 1,552 |
| Scripts present | 270 (17.4%) |
| Verified effects | 38 (2.4%) |
| Missing scripts | 1,282 |
| Vanguard Disciplines text cards | 29/29 verified |
| Starter cohort scripted / verified / missing | 61 / 29 / 118 |

Coverage is not correctness. A script being present does not mean every printed
clause is implemented. The full report is in
[`docs/scripts/coverage-0.3.0.md`](scripts/coverage-0.3.0.md); the generated
starter table is in [`docs/scripts/starter-cohort.md`](scripts/starter-cohort.md).

## Verification recorded for this build

- `npm run build:win` passed: syntax, seed lint, tests, seed generation, and
  packaging.
- `npm run check:syntax`: 47 files, syntax OK.
- `npm run scripts:lint`: 276 entries, 0 errors, 0 warnings.
- `npm test`: 195 passing, 0 failing.
- The 0.3.0 Vanguard test file contains 28 tests, including Catch! empty-hand
  and illegal-equipment cases, Silence and Suppress no-equipment and champion
  cases, Steadfast Elkin multiple-copy/enemy-equip/repeat-equip cases, and
  Shen's below-threshold and self-Barrier cases.
- An earlier 0.3.0 packaged build passed fresh-seed smoke: it installed 275
  seed scripts (43 curated entries, including 5 generated/level-2 scripts),
  served 1,647 cards at app version 0.3.0 with `desktop: true`, and closed
  without leaving processes or listening ports. After the final Steadfast Elkin
  seed-scope correction, the executable was rebuilt to the size and checksum
  above. Under the headless-only instruction it was not relaunched, so the smoke
  evidence covers the packaging path and seed installation rather than the exact
  final hash.

## Upgrade notes

- Existing installations merge the 0.3.0 seed scripts with a backup. Custom
  entries are preserved, curated entries are not overwritten, and locally
  modified generated entries are kept.
- All players in a room should use the same release. The protocol number did
  not change, but card scripts did.
- Keep a copy of the per-user data directory before upgrading if the installation
  contains custom cards or hand-edited scripts.

## Open gates and known limitations

The following are **not** claimed for 0.3.0:

- External-network play between separate internet connections.
- Relay/TURN behavior or an observed relay path.
- Clean-machine launch on a Windows account without the build toolchain.
- Full 2v2, spectator, and reconnect verification.
- A completed 1v1 match played from start to finish over the peer transport.
- The user-reported mulligan stall. It was not reproduced by the automated
  suite and is not claimed fixed.

Other limitations:

- 1,282 text cards still have no script, and 232 present scripts are generated
  and unverified.
- The other five starter decks still contain 118 text cards without scripts and
  32 unverified scripts.
- Card-effect automation remains partial; see
  [`docs/effect-dsl.md`](effect-dsl.md) for the supported DSL surface.
- The build is unsigned. Signing is not configured.

## Links

- Release: <https://github.com/AlyAmgadAly/nexus-forge/releases/tag/v0.3.0>
- Testing procedure: [`docs/testing.md`](testing.md)
- Effect DSL: [`docs/effect-dsl.md`](effect-dsl.md)
- Coverage report: [`docs/scripts/coverage-0.3.0.md`](scripts/coverage-0.3.0.md)
- Previous release: <https://github.com/AlyAmgadAly/nexus-forge/releases/tag/v0.2.0>
