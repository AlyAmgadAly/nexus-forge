# Nexus Forge

A Runeterra-inspired card game with a scenic home screen, deck builder, Card Forge, private rooms, spectators, and an existing engine for 1v1 and 2v2.

**Current version: 0.3.0 — portable Windows desktop build with room-code multiplayer and complete Vanguard starter-deck effect coverage.** The original browser/local Node development route still works. Desktop internet play uses Electron, PeerJS/WebRTC, and the host's authoritative game process. Real separate-network acceptance testing is still a human-run release gate; see [Limits and pending validation](#limits-and-pending-validation).

## Play on Windows

1. Download `NexusForge-0.3.0-portable.exe` from the [Nexus Forge 0.3.0 release](https://github.com/AlyAmgadAly/nexus-forge/releases/tag/v0.3.0), or build it locally with `npm run build:win` (see [Build the Windows release](#build-the-windows-release)). No Node.js installation is required.
2. Launch the game. The executable is portable, but user data is stored per Windows account (see [Data and backups](#data-and-backups)). The build is unsigned, so Windows SmartScreen may warn on first launch; use **More info → Run anyway** only for a build you trust.
3. Choose **Create a room**, then share the five-character room code.
4. Friends launch their own copy, choose **Join a room** or **Spectate**, and enter the code.

If the repository or release is private, each friend needs GitHub access before they can download the build. The executable is portable, but user data is stored per Windows account; replacing the `.exe` with a newer build does not remove it.

Internet rooms use public PeerJS signaling and public STUN. They do not require a VPN, a shared LAN, router port forwarding, or a paid game server. The host's computer owns the room and must stay open for the session. Host migration and host-crash resume are not supported. Some restrictive networks may require a TURN relay; no free relay is bundled or guaranteed yet, so connectivity can still fail on those networks.

The desktop app binds its internal service to `127.0.0.1` and exposes no LAN or public HTTP port. Guests reach the host through WebRTC after finding the room's namespaced PeerJS identity.

## Develop

Install Node.js 20 or newer, then:

```powershell
npm ci
npm start
```

Open <http://localhost:3000>. This is the browser development mode: the server binds to `0.0.0.0`, rooms are local to that server, and internet hosting/joining is desktop-only. `PORT` can select a different port.

Run the desktop app against the working tree:

```powershell
npm run desktop
```

Use a separate per-user data directory for an isolated test instance:

```powershell
$env:NEXUS_DATA_DIR = "$env:TEMP\nexus-forge-test\data"
npm run desktop
```

`NEXUS_DATA_DIR` and `NEXUS_SEED_DIR` also exist for test harnesses. In development, the first desktop launch migrates writable project data (`settings.json`, decks, custom cards, scripts, mechanics, keywords, and cached art) into the user-data folder and writes a backup first. Seed card data remains immutable.

## Data and backups

On Windows, the default desktop data directory is:

```text
%APPDATA%\Nexus Forge\data
```

It contains the local admin token, local rules/settings, decks, custom cards, Card Forge scripts, and cached art. The packaged seed (`cards.json`, `scripts.json`) lives beside the executable resources and is copied into writable storage only where needed.

Migration backups are written under `%APPDATA%\Nexus Forge\backups\data-<timestamp>\`. Back up the `data` folder before deleting the app or moving to another machine. Cached card art is downloaded on demand and is not part of the release artifact.

## Verify

```powershell
npm run check:syntax
npm test
```

The suite currently contains 195 automated tests across engine, event ordering and dispatch, state/equipment/support mechanics, migration, protocol/content, deck validation, script vocabulary, verification metadata, seed upgrades, authoring tooling, and coverage reporting. `npm run check:syntax` checks 47 files. `npm run scripts:lint` validates 276 script entries. `npm run build:win` runs all checks before packaging the portable Windows x64 artifact into `release/`.

Current card-effect status: **270 scripts present (17.4% of 1,552 text cards); 38 verified (2.4%).** All 29 Vanguard Disciplines starter-deck text cards are verified; the other five starter decks remain in progress. Coverage is not correctness. See [docs/effect-dsl.md](docs/effect-dsl.md) and run `npm run scripts:coverage` for the measured report.

For the complete test procedure, including local two-instance checks and the separate-network release gate, see [docs/testing.md](docs/testing.md).

Local evidence recorded for 0.3.0:

- `npm run build:win` passed syntax, lint, all 195 tests, seed generation, and produced `release/NexusForge-0.3.0-portable.exe`.
- An earlier 0.3.0 packaged build launched with fresh seed data, served 1,647 cards at app version 0.3.0 with `desktop: true`, installed 275 seed scripts (43 curated entries, including 5 generated/level-2 cards), and closed without leaving processes or listening ports. After the final seed-script correction, the executable was rebuilt and its checksum updated; under the headless-only instruction it was not relaunched, so the smoke evidence covers the packaging path and seed installation rather than the exact final hash.
- The 0.3.0 changes affect card scripts and engine effects, not the peer transport.

Desktop multiplayer evidence recorded for 0.2.0 (transport unchanged in 0.3.0):

- Two Electron instances with separate profiles completed host/guest lobby flow over PeerJS, including filtered guest state.
- Ready, mulligan, game start, card play, and pass flow worked in both directions.
- A guest's custom-deck submission triggered content review; host approval merged the card, and the submitted deck started a game.
- A deck containing a Card Forge card saved and reloaded normally. Its optional Riot share code is blank rather than blocking the save.
- Forced data-channel loss showed the reconnect overlay and recovered the same seat with a rotated token; cancel returned Home.
- Host departure closed the room and returned the guest Home.
- Clipboard room-code copy worked in Electron after the narrow clipboard-write permission allowance.
- A dev-profile restart preserved the admin token, a custom card, and a saved deck.
- The 0.2.0 packaged portable executable launched with fresh seed data, served 1,647 cards, registered a PeerJS host room, and exited without leaving processes or listening ports.

These are same-machine checks. They do not prove reachability across separate internet connections.

## Limits and pending validation

- **External network gate pending:** home broadband versus mobile hotspot and friends on separate networks have not been run on this machine. Those results must be recorded before claiming internet play is release-verified.
- **Relay/TURN gate pending:** public STUN is configured; no working free TURN relay has been proven. Restrictive NAT may prevent a connection.
- 2v2 and spectator flows over the peer transport have automated server coverage but still need a recorded external session.
- Card-effect automation remains partial: 270 scripts present (17.4% of text cards), 38 verified (2.4%). Vanguard is fully verified; the other five starter decks contain 118 text cards without scripts and 32 unverified scripts. A card being present does not mean every printed behavior is implemented.
- A user-reported mulligan stall remains under investigation. It was not reproduced by the automated suite, and this release does not claim to fix it.
- Rewards, Battle Pass, and Store remain visibly unavailable.
- macOS/Linux/mobile packaging, automatic updates, accounts, matchmaking, host migration, and cloud saves are out of scope for this release.

## Source map

| Path | Responsibility |
| --- | --- |
| `desktop/main.js` | Electron lifecycle, loopback service, validated IPC, security, clean shutdown |
| `desktop/preload.cjs` | Narrow renderer bridge for config, admin token, and peer relay |
| `public/js/app.js` | Client navigation, room/transport orchestration, reconnect, content offers |
| `public/js/net/peer.js` | Host/guest PeerJS transports, namespacing, buffering, status |
| `public/js/views/` | Home, room lobby, deck builder, Card Forge, and battlefield |
| `server/service.js` | Express API, static client, WebSocket/peer dispatch, art, shutdown |
| `server/rooms.js` | Authoritative rooms, snapshots, roles, decks, content approval, reconnect |
| `server/peerhub.js` | Host-side peer sessions, handshakes, limits, resume tokens |
| `server/dispatch.js` | Transport-neutral allowlisted client message dispatch |
| `server/content.js` | Custom card/script/deck sanitization and transfer-safe content |
| `server/data-migration.js` | Backed-up migration into per-user writable data |
| `server/engine/` | Game state, rules, card database, and declarative effects |
| `server/store.js` | Seed/writable data separation and persistence |
| `shared/` | Protocol versions, manifest compatibility, deck codes |
| `test/` | Engine, migration, multiplayer, and protocol regression coverage |
| `docs/testing.md` | Automated, local desktop, packaged-app, and external-network test procedure |
| `docs/effect-dsl.md` | Trigger, action, target, condition, and verification reference |
| `docs/backups.md` | Backup locations and recovery steps for scripts and migrations |
| `docs/release-0.3.0.md` | Release artifact, checksum, evidence, and open gates |

## Build the Windows release

```powershell
npm run build:win
```

Output: `release/NexusForge-0.3.0-portable.exe`. The build is unsigned; Windows SmartScreen may warn on first launch. Signing is not configured. Release notes record the checksum for the built artifact; rebuilds produce a different hash.

Development work and milestone evidence are tracked in [ROADMAP.md](ROADMAP.md).
