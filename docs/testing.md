# Testing Nexus Forge 0.2.0

This guide covers automated checks, local desktop smoke tests, and the external-network release gate. Always record the exact build, commit, checksum, devices, and networks used. A same-machine test does not prove internet reachability.

## 1. Automated checks

Prerequisites: Node.js 20 or newer and npm.

```powershell
npm ci
npm run check:syntax
npm test
```

Expected for this release:

- Syntax check: 34 files.
- Tests: 23 passing (12 engine, 3 data migration, 2 service/peer, 6 protocol/content).
- `npm run build:win` reruns both checks before packaging.

Record:

- Date and tester.
- Commit SHA.
- Node.js and npm versions.
- Windows version.
- Pass/fail output for each command.

## 2. Browser development smoke test

This checks the retained browser/Node route. Internet hosting and joining are desktop-only.

```powershell
npm start
```

Open <http://localhost:3000> and check:

- Home screen loads and card count is shown.
- Deck Builder opens and an existing deck loads.
- Card Forge opens with the local admin token.
- `/api/health` returns `"desktop": false`.

Stop the server with `Ctrl+C`. Confirm the port is no longer listening.

## 3. Local desktop two-instance test

Use the portable executable or `npm run desktop`. Two instances must use different data directories and different Electron profile directories; otherwise the single-instance lock or shared data makes the test invalid.

PowerShell example with the portable executable:

```powershell
$root = "$env:TEMP\nexus-forge-local-test"

# Host instance
$env:NEXUS_DATA_DIR = "$root\host-data"
Start-Process -FilePath ".\release\NexusForge-0.2.0-portable.exe" `
  -ArgumentList "--user-data-dir=$root\host-profile"

# Guest instance, run in a second terminal
$root = "$env:TEMP\nexus-forge-local-test"
$env:NEXUS_DATA_DIR = "$root\guest-data"
Start-Process -FilePath ".\release\NexusForge-0.2.0-portable.exe" `
  -ArgumentList "--user-data-dir=$root\guest-profile"
```

For the development app, use `npm run desktop -- --user-data-dir="<path>"` with a separate `NEXUS_DATA_DIR` for each instance.

Checklist:

- [ ] Host creates a room and gets a five-character code.
- [ ] Guest joins with the code and sees the filtered lobby.
- [ ] Guest cannot see the host's saved decks, hand, admin token, or reconnect credentials.
- [ ] Both players ready; host starts the game.
- [ ] Both players lock in mulligan hands; the match starts.
- [ ] A played unit, a pass, and the resulting state appear on both sides.
- [ ] Forcing the guest connection down shows the reconnect overlay; automatic reconnect restores the same seat and game state.
- [ ] Cancelling reconnect returns the guest to Home.
- [ ] Host leaving closes the room and returns the guest to Home.
- [ ] A guest custom card/deck can be submitted, reviewed, approved, and used to start a match.
- [ ] Room-code copy writes the correct code to the clipboard.
- [ ] Closing both apps leaves no app processes or service ports behind.

This is adapter/UI smoke evidence only. It is useful, but it does not establish external connectivity.

## 4. Packaged app smoke test

Use the exact executable and checksum being evaluated.

- [ ] Launch the `.exe` on Windows. No Node.js installation is required.
- [ ] Windows SmartScreen may warn because the build is unsigned; use **More info → Run anyway** only for a build you trust.
- [ ] Home screen loads with 1,647 base cards on a fresh data directory.
- [ ] Create a room; the app registers a PeerJS host room.
- [ ] Save a deck, including one Card Forge card. The deck should save; its optional Riot share code may be blank.
- [ ] Close the app and confirm no `Nexus Forge` or Electron processes remain.
- [ ] Confirm the local service port is closed and user data was created under `%APPDATA%\Nexus Forge\data`.
- [ ] Relaunch and confirm the saved deck, custom card, and admin token persist.
- [ ] Check the packaged resources contain the seed files and unpacked `sharp` native files.

## 5. External-network release gate

This is the gate that decides whether internet play can be called release-verified. It requires at least two people on genuinely separate networks. Do not substitute two windows on one PC, two devices on one LAN, or a VPN.

### Prerequisites

- Both people use the same tested release/checksum.
- Host is on home broadband; guest is on a mobile hotspot (or vice versa).
- No VPN, shared LAN, manual port forwarding, or paid relay.
- Host keeps the app open for the entire session.
- Record whether the connection used a direct path or a relay. If the UI does not expose this, record `not exposed` rather than guessing.

### Required scenarios

1. **External 1v1:** host creates a room, guest joins by code, both ready, start, and play to a completed match.
2. **Mobile hotspot:** repeat the 1v1 with one side on a phone hotspot.
3. **Guest recovery:** while the host stays connected, interrupt the guest's internet, then restore it. The guest must return to the same seat and current filtered game state.
4. **Host departure:** host leaves; guest must see the room close and return Home.
5. **2v2 with four players:** correct seats/teams, gameplay, and no hidden hand leakage.
6. **Spectator:** a separate copy joins as a spectator and receives restricted updates.
7. **Restrictive NAT/relay:** try a network that commonly needs a relay. Record success, failure, or the exact limitation. Public STUN alone is not proof that a relay works.

### Test record

Copy this table into the release issue or a QA note for each session:

| Field | Value |
| --- | --- |
| Date/time | |
| Tester(s) | |
| Commit/build | |
| SHA-256 | |
| Host network/device | |
| Guest network/device | |
| Scenario | |
| Path (direct/relay/not exposed) | |
| Result (pass/fail) | |
| Errors or screenshots | |
| Reconnect seat preserved? | |
| No paid server/VPN/LAN/port forwarding? | |

### Safety and privacy

- Never share the Card Forge admin token, reconnect tokens, or raw session logs publicly.
- Redact IP addresses and account names before attaching screenshots.
- Test only with people you trust; the host owns the authoritative match process.

## 6. Release sign-off

Do not mark M6 or M7 complete, and do not describe internet play as verified, until the external scenarios above have recorded results. Known limitations that remain even after a successful test:

- The host must stay online; there is no host migration or crash resume.
- Some restrictive networks may need a TURN relay; no free TURN service is bundled or guaranteed.
- Browser mode remains server-local and cannot host internet rooms.
- Card-effect automation is partial.
