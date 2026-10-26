# Nexus Forge roadmap

Planning baseline: **26 October 2026**. This roadmap records agreed direction, not completed networking features. Milestones are ordered by dependency; no delivery dates are committed.

## Intended outcome

Deliver a portable Windows game that friends can download, launch, and play together over the internet using a short room code, following Codenames Masry's Electron + PeerJS/WebRTC model. Players should not need Node.js, terminal commands, router port forwarding, a VPN, a shared LAN, or a paid dedicated game server.

Each player runs their own copy. The host's computer owns the room and authoritative match state. Public signaling helps peers find each other; WebRTC carries game messages directly or through a relay when required and available. The host must remain online. Free public infrastructure has availability and network restrictions, so real internet testing is a release gate rather than a promise of universal connectivity.

## Baseline and scope

Already present:

- Vanilla JavaScript UI and an Express/WebSocket Node.js server.
- A reference-based scenic home screen, with browser QA and screenshots in `docs/qa/lobby/`.
- Deck building and deck-code import/export; Card Forge and configurable local rules.
- Room creation, joining, spectating, chat, readiness, host controls, and 1v1/2v2 engine paths.
- Player-specific game views and 12 existing engine tests. Card-effect automation remains partial.

The current client connects to the server serving its page through `/ws`; its room code is only meaningful to that server. Electron packaging and PeerJS internet discovery do not exist yet. The earlier home-screen browser checks do not count as cross-network multiplayer verification.

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
| [M1](https://github.com/AlyAmgadAly/nexus-forge/milestone/1) | Desktop runtime, writable data, lifecycle, and development checks | M0 | Not started | [#1](https://github.com/AlyAmgadAly/nexus-forge/issues/1) |
| [M2](https://github.com/AlyAmgadAly/nexus-forge/milestone/2) | PeerJS connection proof across separate internet networks | M1 | Not started | [#2](https://github.com/AlyAmgadAly/nexus-forge/issues/2) |
| [M3](https://github.com/AlyAmgadAly/nexus-forge/milestone/3) | Authoritative rooms and gameplay through the peer transport | M2 | Not started | [#3](https://github.com/AlyAmgadAly/nexus-forge/issues/3) |
| [M4](https://github.com/AlyAmgadAly/nexus-forge/milestone/4) | Player decks, room content synchronization, and version checks | M3 | Not started | [#4](https://github.com/AlyAmgadAly/nexus-forge/issues/4) |
| [M5](https://github.com/AlyAmgadAly/nexus-forge/milestone/5) | Reconnects, host departure, and clear connection states | M3, M4 | Not started | [#5](https://github.com/AlyAmgadAly/nexus-forge/issues/5) |
| [M6](https://github.com/AlyAmgadAly/nexus-forge/milestone/6) | Automated regression coverage and real-network release testing | M1-M5 | Not started | [#6](https://github.com/AlyAmgadAly/nexus-forge/issues/6) |
| [M7](https://github.com/AlyAmgadAly/nexus-forge/milestone/7) | Portable Windows release and player instructions | M6 | Not started | [#7](https://github.com/AlyAmgadAly/nexus-forge/issues/7) |

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

- [ ] Desktop development launch reaches the same home screen and local deck/Card Forge features.
- [ ] First-run data is created in a writable user location; a second launch preserves a deck/custom-card edit.
- [ ] The desktop service does not listen on public network interfaces, and quits cleanly.
- [ ] Browser development still works and all baseline tests pass.

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

- [ ] Two desktop instances on different internet connections exchange messages using only a room code.
- [ ] At least one test uses home internet versus a mobile hotspot; record devices, builds, and connection path.
- [ ] Occupied code, missing room, unavailable signaling, timeout, cancel, and retry leave a usable UI.
- [ ] Evidence distinguishes a real external connection from two windows on the same computer/LAN.

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

- [ ] Host and guest complete an existing 1v1 match over the peer adapter using shared starter content.
- [ ] Four players can join the 2v2 flow with the correct seats/teams; spectators receive updates.
- [ ] Host-only controls and private state remain restricted, including during rematches.
- [ ] Equivalent WebSocket and peer action sequences produce equivalent authoritative results.

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

- [ ] Players with different local deck IDs can submit valid decks and play.
- [ ] A host-approved custom card missing on a guest is rendered and resolves consistently.
- [ ] Invalid decks, unknown/unsupported definitions, incompatible versions, corrupt transfers, and oversized payloads fail clearly before match start.
- [ ] Joining/leaving a room does not overwrite local decks, admin settings, or custom cards.

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

- [ ] A temporarily disconnected guest returns to the same authorized seat and current filtered game state while the host stays alive.
- [ ] Disconnect/reconnect does not apply an action twice, leak private state, or create an extra seat.
- [ ] Host departure, expired session, kick, and failed reconnect lead to a clear route back to Home.
- [ ] Home/lobby/game remain usable with keyboard controls and at previously checked screen sizes.

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

Use REA/runtime capture for desktop/browser flows where supported, alongside test logs and screenshots. Record build/commit, devices, network arrangement, direct/relay path, scenario outcome, and relevant errors. Redact reconnect credentials and admin tokens. Human-run separate-device tests remain pending until actually performed.

Acceptance criteria:

- [ ] Automated checks pass and relevant UI flows have runtime evidence.
- [ ] The external 1v1, four-player 2v2, spectator, and reconnect scenarios have recorded results.
- [ ] Any network limitations are explicit; unresolved blocking failures prevent release sign-off.
- [ ] No paid server, VPN, shared LAN, or manual port forwarding was needed for the supported acceptance paths.

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
- [ ] Two friends on separate internet connections host/join and play with the release artifact.
- [ ] The release links to a matching commit/checksum and documents supported paths and remaining limitations.

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
