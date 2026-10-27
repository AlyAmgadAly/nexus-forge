# Nexus Forge roadmap

Planning baseline: **26 October 2026**. Content baseline updated **27 October 2026** after the Reckless Revenants batch. This roadmap records agreed direction and current verification state. Milestones are ordered by dependency; no delivery dates are committed.

## Intended outcome

Deliver a portable Windows game that friends can download, launch, and play together over the internet using a short room code, following Codenames Masry's Electron + PeerJS/WebRTC model. Players should not need Node.js, terminal commands, router port forwarding, a VPN, a shared LAN, or a paid dedicated game server.

Each player runs their own copy. The host's computer owns the room and authoritative match state. Public signaling helps peers find each other; WebRTC carries game messages directly or through a relay when required and available. The host must remain online. Free public infrastructure has availability and network restrictions, so real internet testing is a release gate rather than a promise of universal connectivity.

## Baseline and scope

Already present:

- Vanilla JavaScript UI and an Express/WebSocket Node.js server, retained as the browser/LAN development route.
- A reference-based scenic home screen, with browser QA and screenshots in `docs/qa/lobby/`.
- Deck building and deck-code import/export; Card Forge and configurable local rules.
- Room creation, joining, spectating, chat, readiness, host controls, and 1v1/2v2 engine paths.
- Player-specific game views and 215 automated tests. Card-effect automation remains partial: 282 scripts present (18.2% of 1,552 text cards), 56 verified (3.6%).
- Electron 0.3.0 desktop shell, per-user writable data with backup migration, loopback service lifecycle, and portable Windows packaging.
- PeerJS/WebRTC host and guest transports, room content manifests, filtered peer views, validated deck submissions, host-approved custom content, reconnect tokens, host-close behavior, and desktop connection UI.
- 215 automated tests covering the engine, data migration, peer rooms/service lifecycle, manifests, content sanitization, deck payloads, deck-code fallback for Card Forge cards, effect DSL, script coverage, and the Vanguard and Reckless Revenants starter batches.
- All 29 Vanguard Disciplines starter-deck text cards are scripted and verified. Reckless Revenants is 18/31 verified with 12 missing and one generated script; the other four starter decks contain 95 unique text cards without scripts. See `docs/scripts/coverage-0.3.0.md` (current working tree, not the published 0.3.0 artifact).

The desktop path for M1-M5 and M7 packaging is implemented and was exercised locally with two Electron instances on one Windows machine: host/join over PeerJS, ready/mulligan/start, bidirectional game actions, guest reconnect and cancel, host close, custom deck/content approval, clipboard copy, data persistence, portable launch, and clean shutdown. The real separate-network matrix in M6 has not been run. Local two-instance evidence is adapter/UI smoke evidence only and does not prove internet reachability.

Preserve the existing game rules, deck builder, Card Forge, room roles, and completed home layout during migration. Keep the browser/Node development route working. Future deck-selection and battlefield visual redesigns can use the other supplied references after this networking work; they are not prerequisites for the desktop internet release. Rewards, Battle Pass, and Store remain unavailable.

## Architecture decision

| Concern | Current implementation | Planned implementation |
| --- | --- | --- |
| Application launch | Browser plus manually started Node server | Electron owns the window and local service lifecycle |
| Local UI and APIs | Express serves `public/`, `/api/`, and `/art/` | Retain those contracts behind an internal loopback service initially |
| Online discovery | Clients must reach the same server | Namespaced PeerJS identity derived from a short room code |
| Online transport | Browser WebSocket to the host server | Reliable WebRTC data connection between each guest and host |
| Rules and actions | `server/engine/` and `RoomManager` validate messages | Reuse the same authority in the host's Node runtime |
| Client information | Per-player views from the server | Per-peer filtered views; never broadcast complete engine state |
| Deck selection | A deck ID in the server's shared store | Validated deck payload owned by each player, checked against room content |
| Persistence | Project `data/` directory | Writable per-user desktop data, separate from packaged seed content |

Recommended initial boundary: keep the existing web UI and local HTTP API, start the local service on `127.0.0.1` with an available port, and run PeerJS in Electron's renderer where browser WebRTC is available. Use a narrow preload/IPC bridge to deliver host-side peer messages to the Node room service and return filtered responses. The host's own UI uses the same action dispatcher. Guests' local APIs manage their own decks/art; remote game actions go to the room host.

Avoid a second game engine in the renderer. Separate message dispatch from WebSocket-specific objects before adding the peer adapter. Select main/utility/child process ownership during M1 based on startup, packaging, and shutdown evidence; keep that choice internal to the desktop runtime.

## Milestones and tracking

| Milestone | Deliverable | Depends on | Status | Tracking |
| --- | --- | --- | --- | --- |
| M0 | GitHub repository, reproducible baseline, and this roadmap | Existing project | Complete | Source and documentation on `main` |
| [M1](https://github.com/AlyAmgadAly/nexus-forge/milestone/1) | Desktop runtime, writable data, lifecycle, and development checks | M0 | Complete (local) | [#1](https://github.com/AlyAmgadAly/nexus-forge/issues/1) |
| [M2](https://github.com/AlyAmgadAly/nexus-forge/milestone/2) | PeerJS connection proof across separate internet networks | M1 | Implemented; external proof pending | [#2](https://github.com/AlyAmgadAly/nexus-forge/issues/2) |
| [M3](https://github.com/AlyAmgadAly/nexus-forge/milestone/3) | Authoritative rooms and gameplay through the peer transport | M2 | Implemented; local 1v1 play verified, full match/2v2/spectator pending | [#3](https://github.com/AlyAmgadAly/nexus-forge/issues/3) |
| [M4](https://github.com/AlyAmgadAly/nexus-forge/milestone/4) | Player decks, room content synchronization, and version checks | M3 | Implemented; local deck/content approval verified | [#4](https://github.com/AlyAmgadAly/nexus-forge/issues/4) |
| [M5](https://github.com/AlyAmgadAly/nexus-forge/milestone/5) | Reconnects, host departure, and clear connection states | M3, M4 | Implemented; local reconnect/host-close verified | [#5](https://github.com/AlyAmgadAly/nexus-forge/issues/5) |
| [M6](https://github.com/AlyAmgadAly/nexus-forge/milestone/6) | Automated regression coverage and real-network release testing | M1-M5 | Automated checks pass; external matrix pending | [#6](https://github.com/AlyAmgadAly/nexus-forge/issues/6) |
| [M7](https://github.com/AlyAmgadAly/nexus-forge/milestone/7) | Portable Windows release and player instructions | M6 | v0.3.0 published; clean-machine/external gates pending | [#7](https://github.com/AlyAmgadAly/nexus-forge/issues/7) |

GitHub issues and milestones mirror M1-M7. Completing an issue requires its acceptance criteria and recorded evidence, not just code being merged.

### M0 - Repository and baseline

- [x] Create a private `AlyAmgadAly/nexus-forge` GitHub repository and push the current source.
- [x] Add setup instructions, this roadmap, and linked GitHub tracking issues.
- [x] Exclude `node_modules/`, local settings/admin tokens, art cache, temporary files, and release outputs.
- [x] Run the existing tests and verify a clean source snapshot with no application rule changes.

Baseline verification: all 12 engine tests and the home/app JavaScript syntax checks passed. Local Markdown links resolved, the staged files contained no matches for the checked credential patterns or the actual local admin token, and settings/cache/dependencies were confirmed ignored. This does not establish desktop or internet multiplayer support; those remain M1-M7 work.

### M1 - Desktop foundation and local data

**Goal:** Launch the current application as a desktop game while preserving the development workflow.

Implementation:

- Add Electron entry point and preload modules compatible with the existing ES-module package. Add desktop development/build commands without replacing `npm start` or `npm test`.
- Extract server startup into an explicit start/stop API. Desktop startup binds only to loopback, uses an available port, waits for readiness, and opens the existing home screen. Standalone development keeps its current behavior.
- Keep Node integration out of the renderer and enable context isolation. Expose only the IPC operations the application needs; validate their sender and payloads. Restrict unexpected navigation, new windows, and external URLs.
- Give the Node host service an explicit lifecycle. Handle startup failure, repeated launches, window close, and app quit without leaving processes, WebSocket timers, or listening ports behind.
- Package immutable seed cards/scripts separately from writable settings, decks, custom cards, and cached art. Initialize a per-user directory on first launch, use `NEXUS_DATA_DIR` or a store constructor option, and preserve user changes across restarts/upgrades.
- Define explicit import/export or migration of existing project data, with a backup before transformation. Generate admin credentials locally; never bundle the current settings file or expose its token to peers.
- Establish CI for dependency installation, syntax checks, and the existing engine tests. Pin and lock the selected Electron/packaging dependencies at implementation time.

Likely touch points: `package.json`, `server/index.js`, `server/store.js`, new desktop entry/preload files, and CI configuration.

Acceptance criteria:

- [x] Desktop development launch reaches the same home screen and local deck/Card Forge features.
- [x] First-run data is created in a writable user location; a second launch preserves a deck/custom-card edit.
- [x] The desktop service does not listen on public network interfaces, and quits cleanly.
- [x] Browser development still works and all baseline tests pass.

Local evidence (26 October 2026, Windows, Electron 45.0.0): the desktop development launch reached the home screen with 1,647 base cards and working deck/Card Forge APIs. A saved custom card, deck, and generated admin token survived a full profile restart. The service bound `127.0.0.1` on an ephemeral port and quit without leaving Electron processes or listening service ports. Browser `npm start` still served `/api/health` with `desktop:false`. These checks ran on the build machine; the clean-machine launch is tracked under M7.

### M2 - Internet connection proof

**Goal:** Prove the free connection model before integrating full gameplay.

Implementation:

- Add the PeerJS client and a small transport wrapper with host, join, send, receive, close, and status events. Keep service configuration in one place; do not copy Codenames' room namespace.
- Register a host ID such as `nexus-forge-v1-<ROOMCODE>`. Keep five-character codes where possible; handle globally occupied IDs with bounded retries and a clear error. Normalize typed codes and separate namespace/protocol versions.
- Connect guests through the public signaling service and use a reliable data connection. Distinguish signaling registration from an actually open peer connection.
- Add a minimal handshake with app/protocol version and a message echo, explicit timeouts, cancellation, and cleanup. Do not auto-retry indefinitely or create duplicate connections when screens change.
- Check the installed PeerJS defaults and current STUN/TURN options. Record whether each proof used a direct path or relay; a configured relay URL alone is not evidence it works.
- Make a go/no-go decision from actual separate-network tests. If the free relay path cannot support a tested network combination, record the limitation and investigate a compatible free option before promising support.

Acceptance criteria:

- [ ] **External gate:** two desktop instances on different internet connections exchange messages using only a room code.
- [ ] **External gate:** at least one test uses home internet versus a mobile hotspot; record devices, builds, and connection path.
- [ ] Occupied code, missing room, unavailable signaling, timeout, cancel, and retry leave a usable UI. *(Implemented with bounded retries, timeouts, cancellation, and error states; the full manual failure matrix is not recorded.)*
- [ ] **External gate:** evidence distinguishes a real external connection from two windows on the same computer/LAN.

Local evidence: two Electron instances with separate profiles registered `nexus-forge-v1-<CODE>` identities and joined with a five-character code. This proves the adapter and UI work on one machine; it is explicitly not separate-network evidence. No external row of the M6 matrix has been run.

### M3 - Authoritative peer rooms and gameplay

**Goal:** Route existing room and match behavior through PeerJS without duplicating the rules engine.

Implementation:

- Extract a shared action dispatcher from the WebSocket handler in `server/index.js`. Give `RoomManager` a transport-neutral connection/send interface; its current `readyState`, `send`, `close`, and attached socket properties need an adapter or focused replacement.
- Keep the existing WebSocket adapter for browser development and add the peer adapter. Map each open peer to a host-issued session identity and role; never trust a guest-supplied player ID as authority.
- Validate message type, structure, size, role, and room membership before dispatch. Ignore/reject unsolicited game snapshots, guest admin requests, host-only actions from guests, and arbitrary HTTP/filesystem requests.
- Preserve create/join/spectate/leave, mode changes, seating/team moves, kicks, deck selection, readiness, start, chat, rematch, and existing game actions. Use matched built-in starter content until M4 adds independent content synchronization.
- Derive one filtered `viewFor` response per recipient. Verify opponent hands, draw order, and private choices are absent from peer payloads; spectators keep their intended restricted view.
- Bind room mutations to the correct connection and clean up connections/listeners when leaving. Coordinate the user-visible room code with the PeerJS host registration.

Likely touch points: `public/js/app.js`, `server/index.js`, `server/rooms.js`, and new transport/session modules. Change `server/engine/` only where evidence shows it is necessary.

Acceptance criteria:

- [ ] Host and guest complete an existing 1v1 match over the peer adapter using shared starter content. *(Lobby join, readiness, mulligan, start, a unit play, a pass, and bidirectional updates verified; a match played through to completion is pending.)*
- [ ] Four players can join the 2v2 flow with the correct seats/teams; spectators receive updates.
- [ ] Host-only controls and private state remain restricted, including during rematches. *(Automated coverage rejects guest host controls and hides opponent hands; rematch enforcement is not yet exercised live.)*
- [ ] Equivalent WebSocket and peer action sequences produce equivalent authoritative results.

Local evidence: host and guest reached the filtered lobby, readied, locked in mulligan hands, started the match, played a unit, passed priority, and received each other's authoritative updates. Automated integration coverage verifies host-only rejection, hidden opponent hand details, content approval, reconnect, and host close. The remaining M3 acceptance items are not claimed.

### M4 - Decks, custom cards, and content compatibility

**Goal:** Let separate installations play with their own decks against an agreed room ruleset.

Implementation:

- Replace remote reliance on the host's saved deck IDs with deck submissions containing card IDs/counts. Validate size, copies, regions, enabled pool, and supported definitions on the host.
- Add a room content manifest: protocol/engine schema, base-card data version/hash, rules, enabled/banned pool, custom cards, declarative scripts, mechanics, and keywords actually used by the room.
- Agree on the host's canonical room catalog. Guest-authored custom cards require an explicit host import/approval before they become room content; do not silently overwrite any player's local collection.
- Compare manifests before ready/start, transfer allowed missing definitions, and show actionable version/content errors. Lock the accepted content for an active match so Card Forge edits cannot change rules halfway through play.
- Accept supported declarative effect data only, with schema and size limits. Do not execute JavaScript received from peers. Unsupported effects must be reported rather than silently presented as fully automated.
- Separate gameplay definitions from optional art. Deduplicate/hash custom art, bound image and transfer sizes, use chunks if necessary, and show a fallback when an image is unavailable. Do not transfer the host's entire art cache or secrets.
- Keep the imported session catalog temporary unless the user explicitly saves/imports it. Preserve normal local deck import/export and ownership.

Likely touch points: `public/js/api.js`, deck builder/lobby views, `server/decks.js`, `server/store.js`, `server/engine/carddb.js`, and new manifest/transfer modules.

Acceptance criteria:

- [x] Players with different local deck IDs can submit valid decks and play.
- [ ] A host-approved custom card missing on a guest is rendered and resolves consistently. *(Guest-authored content was approved by the host and the submitted deck started a match; the reverse host-authored direction and in-match resolution still need recorded evidence.)*
- [ ] Invalid decks, unknown/unsupported definitions, incompatible versions, corrupt transfers, and oversized payloads fail clearly before match start. *(Automated coverage exists for deck payload limits, unknown content, script validation, manifests, and oversized offers; corrupt-transfer and full pre-start UI handling remain unrecorded.)*
- [ ] Joining/leaving a room does not overwrite local decks, admin settings, or custom cards.

Local evidence: a guest saved a Card Forge card and a deck, submitted the deck, was told custom content was required, sent the content, and the host approved it through the lobby review panel. The approved room catalog updated for both sides and the submitted deck started a game. Room content is snapshotted per room, so approval does not modify the host's saved collection.

### M5 - Recovery and connection UX

**Goal:** Make interruptions understandable and recoverable without losing seat ownership or match consistency.

Implementation:

- Model offline, registering, hosting, connecting, synchronizing content, in room, playing, reconnecting, and failed states. Show room code and copy action; enable actions based on the current state.
- Replace browser-origin invite assumptions with shareable room text/code. Assess an app-link scheme separately; the first release must work with manual codes alone.
- Issue a private reconnect credential bound to the seat/session. Rejoining with a display name, peer ID, or guessed client ID alone cannot take another player's seat. Rotate/revoke credentials when ownership ends.
- Distinguish signaling disconnection from WebRTC data-channel loss. Retry with bounded backoff, allow cancellation, and restore signaling when the data connection is still healthy.
- Use authoritative revision/request identifiers and a fresh per-player snapshot to recover after reconnect. Prevent duplicate commands, stale selections, and old listeners from replaying actions.
- Define and test a disconnect grace policy for guests, including turn handling, seat expiry, and host removal of abandoned players. Reapply role and content checks when a player returns.
- Treat graceful host exit as a room closure and unexpected host loss as reconnecting followed by an actionable timeout. No automatic host migration or crash-resume is promised in this release.

Acceptance criteria:

- [x] A temporarily disconnected guest returns to the same authorized seat and current filtered game state while the host stays alive.
- [x] Disconnect/reconnect does not apply an action twice, leak private state, or create an extra seat.
- [ ] Host departure, expired session, kick, and failed reconnect lead to a clear route back to Home. *(Graceful host departure and reconnect cancellation were verified; expired-session, kick, and exhausted-retry UI still need recorded checks.)*
- [ ] Home/lobby/game remain usable with keyboard controls and at previously checked screen sizes.

Local/automated evidence: forcing the guest data channel closed showed the reconnect overlay and bounded attempt count; automatic resume restored the same seat, a fresh filtered game view, and a rotated token. Reusing the old token was rejected, duplicate commands were not replayed, and no extra seat was created. Host leave sent `roomClosed` and returned the guest Home; cancelling reconnect also returned Home.

### M6 - Regression and real-network validation

**Goal:** Demonstrate the intended friends-over-internet experience and preserve existing behavior.

Automated coverage:

- Continue the existing 12 engine tests; add focused tests for the shared dispatcher, role/identity binding, manifests, deck submissions, content pinning, and reconnect revisions.
- Run multi-client integration scenarios for 1v1, four-seat 2v2, and a spectator. Cover ready/start, representative card actions, pass/round flow, end game, rematch, and leave/rejoin.
- Inspect serialized guest/spectator payloads for hidden information. Test forged identity, host-only commands, malformed/oversized messages, duplicate/stale actions, and unsupported content.
- Exercise desktop launch, persistence, single-instance/lifecycle behavior, shutdown, and packaged native dependencies, particularly `sharp`.

Network acceptance matrix:

| Scenario | Evidence required |
| --- | --- |
| Same computer/two instances | Adapter and UI smoke test only; not proof of internet reachability |
| Two devices on a LAN | End-to-end functional baseline |
| Home broadband versus mobile hotspot | Real external host/join and complete 1v1 match |
| Friends on separate external networks | Full 2v2 session and spectator updates |
| Restrictive NAT/relay-required path | Observed relay success or an explicit recorded limitation |
| Guest internet loss/recovery | Seat recovery and authoritative state resynchronization |
| Host loss or signaling outage | Correct status, bounded recovery, and usable exit/retry |

Use REA/runtime capture for desktop/browser flows where supported, alongside test logs and screenshots. Record build/commit, devices, network arrangement, direct/relay path, scenario outcome, and relevant errors. Redact reconnect credentials and admin tokens. Human-run separate-device tests remain pending until actually performed. The full automated, local desktop, packaged-app, and external-network procedure is in `docs/testing.md`.

Acceptance criteria:

- [x] Automated checks pass and relevant UI flows have runtime evidence.
- [ ] **External gate:** the external 1v1, four-player 2v2, spectator, and reconnect scenarios have recorded results.
- [x] Any network limitations are explicit; unresolved blocking failures prevent release sign-off.
- [ ] **External gate:** no paid server, VPN, shared LAN, or manual port forwarding was needed for the supported acceptance paths. *(The same-machine path used none of these, but the external paths have not been exercised.)*

Local evidence: `npm run check:syntax` passes 47 files and `npm test` passes 215/215, including engine, event ordering, Vanguard and Reckless Revenants card effects, data migration, peer rooms, manifests, content sanitization, deck payloads, and coverage tooling. The two-instance UI checks listed under M1-M5 provide local runtime evidence for the unchanged 0.2.0 transport. A Windows CI workflow for `npm ci`, syntax checks, and tests exists but has not run on GitHub. Every row that requires a separate device, separate network, or relay observation remains open.

### M7 - Portable Windows release

**Goal:** Friends can download and play the tested build without a developer setup.

Implementation:

- Configure an Electron Builder portable Windows x64 target and a repeatable build command. Preserve the local development scripts.
- Bundle the tested app/runtime/seed content, check `sharp` and other native files in the packaged build, and keep user data/cache outside the executable's packaged resources.
- Verify on a clean Windows machine/account without Node.js. Document where persistent user data lives; a portable launcher does not automatically mean all user data lives beside the executable.
- Publish a versioned GitHub release with executable, checksum, release notes, and a short Host/Join/Spectate guide. Private-repository downloads require collaborator access; decide distribution access before inviting friends. Keep public visibility a separate explicit decision.
- Document host-must-stay-open behavior, recovery limits, art downloads, compatible versions, and any observed free-service/network limitations. Report signing status accurately and assess any signing cost before adding it as a requirement.
- Review asset provenance and dependency notices for the intended distribution. Keep cached art, user decks/settings, local credentials, and QA session secrets out of release artifacts.
- Make a final separate-network smoke test using the exact downloaded executable, rather than only the development app.

Acceptance criteria:

- [ ] The downloaded `.exe` launches on a clean Windows setup, preserves data after restart, and exits cleanly.
- [ ] **External gate:** two friends on separate internet connections host/join and play with the release artifact.
- [x] The release links to a matching commit/checksum and documents supported paths and remaining limitations.

Current release evidence: [Nexus Forge v0.3.0](https://github.com/AlyAmgadAly/nexus-forge/releases/tag/v0.3.0) was published on 27 October 2026 with `NexusForge-0.3.0-portable.exe` (121,460,358 bytes; SHA-256 `3E9EAD7832C7ABE9CB61E2B9CA914447966290030609C8169E4904AD79798C9A`). The release page links to the tagged commit and documents supported paths, checksum, and limitations. The build has not run on a clean Windows machine/account and has not been used between separate networks. The clean-machine and external-network acceptance boxes remain open. The previous [v0.2.0 release](https://github.com/AlyAmgadAly/nexus-forge/releases/tag/v0.2.0) remains published with `NexusForge-0.2.0-portable.exe` (121,332,668 bytes; SHA-256 `AC45ED31054568C0706EAACD681F8BC38A709E13F5584587C63DB218A60D4AAA`).

### Content milestone — Vanguard Disciplines (0.3.0)

- Applied 19 curated entries from `scripts/batches/2026-10-27-vanguard-batch-01.json`: 14 collectible Vanguard text cards plus 5 generated/level-2 cards.
- Vanguard Disciplines is complete: **29/29 text cards verified, 0 missing, 0 partial**. Garen and Shen now include their printed level-up conditions and level-two behavior.
- Added the engine primitives the batch proved: equip-from-hand with cost filtering, filtered top-deck picks, capture/release, allied swap, next-summon buffs, counters, unit/hand transforms, hand-card keywords, and the associated event/condition helpers.
- Coverage: **270 scripts present (17.4%)**, **38 verified (2.4%)**, 1,282 missing. Starter cohort: 61 scripted, 29 verified, 118 missing.
- Regression: 47 syntax files, 195 tests, 276 lint entries with 0 errors and 0 warnings.
- An earlier 0.3.0 packaged build passed fresh-seed smoke: 275 scripts installed (43 curated including 5 generated/level-2 scripts), 1,647 cards served at app version 0.3.0 with `desktop: true`, and clean shutdown with no leftover processes or listening ports. After the final seed-script correction, the executable was rebuilt; under the headless-only instruction it was not relaunched, so this evidence covers the packaging path and seed installation rather than the exact final hash.
- Open gates: external-network, relay/TURN, clean-machine, 2v2, spectator, and reconnect verification; the user-reported mulligan stall remains under investigation and is not claimed fixed.

### Content milestone — Reckless Revenants (post-0.3.0 batch)

- Applied 18 curated entries from `scripts/batches/2026-10-27-reckless-revenants-01.json`; no generated or level-2 entries.
- Reckless Revenants is **18/31 text cards verified, 12 missing, one `auto` script** (`01NX020` Draven). Draven and Elise are blocked on level-up/level-two behavior; the remaining per-card gaps are recorded in `docs/scripts/blocked.md`.
- Added the engine primitives the batch proved: `drain` with actual-damage healing, `reduceCost` with hand-entry cost modifiers, `moveCardToTop`, the `spellKill` event with a landmark guard, `sourceWasBlocked`, enemy-deck `create`, and card-pool `excludeIds`/follower/keyword-text filters.
- Coverage: **282 scripts present (18.2%)**, **56 verified (3.6%)**, 1,270 missing. Starter cohort: 73 scripted, 47 verified, 106 missing.
- Regression: 47 syntax files, 215 tests, 288 lint entries with 0 errors and 0 warnings.
- The 0.3.0 release artifact and tags are unchanged. No build was produced for this post-release batch.
- Execution order and test order for the remaining batches: [`docs/agents/implementation-order.md`](docs/agents/implementation-order.md) and [`docs/agents/testing-order.md`](docs/agents/testing-order.md). The reviewable two-client manual plan is [`docs/agents/manual-game-testing.md`](docs/agents/manual-game-testing.md); it has not been executed under the headless-only instruction.
- Clause-level mechanics specs for batch 2a: [`docs/mechanics/README.md`](docs/mechanics/README.md). `01SI011` Ravenous Butcher and `05NX006` Reborn Grenadier are drafted; no spec is approved and no card was implemented.
- Open gates: external-network, relay/TURN, clean-machine, full 1v1, 2v2, spectator, reconnect, and the mulligan-stall investigation.

## Definition of the first desktop internet release

The first release is complete only when players can launch a Windows executable, share a code, play supported 1v1 and 2v2 matches across separate networks, spectate with the intended visibility, exchange validated decks/custom content, and recover a guest connection while the host remains alive. Existing rules and local authoring features must still work. A local two-window demo or a successful build alone is not completion.

## Deliberately later

- Automatic host migration, match recovery after host crash, cloud saves, accounts, ranked matchmaking, and a permanent hosted backend.
- macOS/Linux/mobile packaging, automatic updates, and one-click app-link registration.
- Completing all imported card scripts and further reference-based deck/battlefield visual redesigns; these need separate scoped milestones after the networking baseline.
- Paid relay infrastructure or a paid dedicated server. If the free path fails a required network case, revisit the choice explicitly with test evidence.

## Source references

- Existing Nexus Forge implementation: `public/js/app.js`, `public/js/api.js`, `server/index.js`, `server/rooms.js`, `server/store.js`, and `server/engine/`.
- Local Codenames Masry reference inspected during planning: `main.js` (Electron shell), `src/net.js` (PeerJS host/join), and `src/app.js` (host-owned state and per-recipient views). Its private/local source is not copied into this repository.
- [PeerJS official project and free cloud option](https://peerjs.com/).
- [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security) and [application paths](https://www.electronjs.org/docs/latest/api/app).
- [Electron Builder Windows targets](https://www.electron.build/win.html).
