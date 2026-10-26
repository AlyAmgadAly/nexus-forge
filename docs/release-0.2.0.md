# Nexus Forge 0.2.0 — desktop internet multiplayer

Release date: 26 October 2026

This release adds a portable Windows desktop app and room-code multiplayer over the internet while keeping the browser/Node development route.

## Artifact

| Item | Value |
| --- | --- |
| Release | [Nexus Forge v0.2.0](https://github.com/AlyAmgadAly/nexus-forge/releases/tag/v0.2.0) |
| File | `NexusForge-0.2.0-portable.exe` |
| Target | Windows x64 portable executable |
| Size | 121,332,668 bytes |
| SHA-256 | `AC45ED31054568C0706EAACD681F8BC38A709E13F5584587C63DB218A60D4AAA` |
| Signing | Unsigned; Windows SmartScreen may warn |
| Runtime | Bundled Electron 45.0.0; Node.js is not required |

The executable is portable, but writable data lives under `%APPDATA%\Nexus Forge\data`, not beside the `.exe`. Copy that folder to keep decks, custom cards, scripts, rules, and the local admin token. Migration backups are under `%APPDATA%\Nexus Forge\backups\`.

## What's new

- Electron desktop shell with a loopback-only local service, context isolation, no renderer Node integration, a narrow validated IPC bridge, restricted navigation/windows, and clean shutdown.
- Per-user writable data separated from packaged seed content. Existing project data migrates with a backup, including a target backup when partial user data already exists.
- PeerJS/WebRTC rooms using `nexus-forge-v1-<CODE>` identities and five-character codes, with occupied-code retries, handshake timeouts, bounded queues, and size/rate limits.
- Authoritative host rooms over the peer transport: create, join, spectate, seats, readiness, chat, start, gameplay, rematch, kick, and leave.
- Per-recipient filtered lobby and game views. Guests never receive host deck lists, admin tokens, reconnect credentials, opponent hands, or effect scripts intended only for the host.
- Room content snapshots and manifests. Deck submissions send card IDs/counts; the host validates size, copies, regions, enabled pool, and definitions.
- Host-reviewed custom content. Only approved cards/declarative scripts are merged into that room; peers never execute JavaScript.
- Reconnect tokens bound to seats, single-use and rotated on resume. A disconnected guest keeps the same seat and filtered state; retries are bounded and cancellable. No host migration.
- Desktop-specific Home/Lobby copy, internet invite text, custom-content review, guest deck submission, reconnect banners/overlay, and clipboard room-code copy.
- Decks containing Card Forge cards now save normally; only the optional Riot share code is left blank because those IDs are not part of the official card-code format.
- Portable Windows build configuration, seed resources, `sharp` native unpacking, and CI for syntax/tests.

## Quick start

1. Run `NexusForge-0.2.0-portable.exe`.
2. **Create a room** and share the five-character code.
3. Each friend launches the same release, chooses **Join a room** (or **Spectate**), and enters the code.
4. Pick decks, ready up, and the host starts.

Full install and development instructions: [README.md](https://github.com/AlyAmgadAly/nexus-forge/blob/main/README.md).

The host must keep the app open. Leaving closes the room for everyone. A guest who drops can reconnect to the same seat for up to two minutes; only that guest's rotated token can reclaim it. There is no automatic host migration or crash resume.

## Compatibility

Both sides should use this release. Hosts compare protocol, engine schema, card-data hash, rules/pool, and scripts during the peer handshake. Blocking mismatches are reported before joining; warnings are shown but remain joinable. Room content is frozen when the room is created, so later Card Forge edits do not change an active room. Guest-authored custom content is offered to the host and applies only to that room after approval.

## Verified locally for this build

These checks ran on one Windows machine with separate Electron profiles/data directories:

- Two instances hosted and joined over PeerJS; the guest reached the filtered lobby with `Connected to host`.
- Ready, mulligan lock-in, game start, a played unit, a pass, and both players' filtered views worked.
- Forcing the guest data channel closed showed the reconnect overlay; automatic resume restored the same seat with a new token. Cancel returned Home.
- Host leave sent `roomClosed` and returned the guest Home.
- A guest saved a custom card and deck, submitted the deck, sent custom content, and the host approved it through the lobby UI. The custom card merged and the submitted deck started a game.
- A deck containing a Card Forge card saved and reloaded; its optional Riot share code is blank instead of blocking the save.
- Clipboard copy of the room code wrote the expected value to the Windows clipboard.
- Restarting the development desktop app preserved the admin token, custom card, and saved deck.
- The rebuilt portable executable launched from `release/`, created fresh user data from packaged seed resources, loaded 1,647 base cards, registered a PeerJS host room, saved a Card Forge deck with a blank optional share code, and closed without leaving processes or listening service ports.
- `npm run check:syntax` passed and all 23 automated tests passed.

## Not verified / release gates

The following have **not** been run and must not be treated as verified:

- Home broadband versus a mobile hotspot.
- Friends on genuinely separate external networks, including a complete external 1v1 and 2v2/spectator session.
- A restrictive NAT that requires a relay. Public STUN is configured; no working free TURN relay is proven.
- Launch on a clean Windows machine/account with no Node.js installed. The portable build was launched on the build machine.
- Reproducibility of the artifact hash across build machines.

The same-machine tests above are adapter/UI smoke evidence only, not proof of internet reachability. See the network acceptance matrix in [ROADMAP.md](https://github.com/AlyAmgadAly/nexus-forge/blob/main/ROADMAP.md).

## Known limitations

- Unsigned build; SmartScreen may prompt.
- No paid or bundled TURN relay is guaranteed; some networks cannot connect with STUN alone.
- No host migration, crash resume, cloud saves, accounts, or matchmaking.
- Card-effect automation is partial; some cards still need tabletop/manual resolution.
- Browser mode remains LAN/server-local and does not host internet rooms.
- Rewards, Battle Pass, and Store remain unavailable.

## Build and verify

```powershell
npm ci
npm run check:syntax
npm test
npm run build:win
```

`npm run build:win` reruns syntax/tests before writing `release/NexusForge-0.2.0-portable.exe`. Rebuilding changes the SHA-256 above. For the complete automated, local desktop, packaged-app, and external-network test procedure, see [docs/testing.md](https://github.com/AlyAmgadAly/nexus-forge/blob/main/docs/testing.md).
