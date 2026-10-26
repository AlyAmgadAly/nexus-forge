# Nexus Forge

A Runeterra-inspired card game with a scenic home screen, deck builder, Card Forge, private rooms, spectators, and an existing engine for 1v1 and 2v2.

**Current version: browser client + local Node.js server. Planned direction: a portable Windows desktop game with free room-code multiplayer over the internet, using Electron and PeerJS/WebRTC, following the connection model used in Codenames Masry.**

The desktop and internet multiplayer migration is planned, not implemented. See the [detailed roadmap](ROADMAP.md) for architecture, dependencies, milestones, and acceptance criteria.

## Run the current application

Install Node.js 20 or newer, then run:

```powershell
npm ci
npm start
```

Open <http://localhost:3000>. `PORT` can select a different port. The current server binds to `0.0.0.0`, so local-network access depends on the host's firewall. A room code currently resolves within that running server; it does not provide internet discovery.

The required card data is checked in. On first launch, the application creates `data/settings.json` and generates a local Card Forge admin token, printed in the server console. That settings file is excluded from Git. Existing local settings are preserved.

Card art is downloaded from configured upstream sources on demand and cached in `data/art/`. The cache is excluded from Git; uncached art needs an internet connection. The home-screen artwork and its provenance are documented in [the lobby notes](docs/lobby-ui.md).

## Verify

```powershell
npm test
```

The baseline contains 12 engine tests. Browser verification and reference-resolution screenshots for the completed home redesign are recorded in [the lobby notes](docs/lobby-ui.md) and [QA results](docs/qa/lobby/verification.json).

## Existing functionality and limits

- Home screen: profile name, live data counters, create/join/spectate actions, and working navigation.
- Decks: browsing, editing, deck codes, and validation.
- Card Forge: custom cards, declarative effects, keywords, and local rule configuration.
- Rooms and game engine: host controls, ready state, 1v1, 2v2, spectators, and per-player game views.
- Card effect coverage is partial. Having a card in the catalog does not mean all of its original behavior is automated.
- Rewards, Battle Pass, and Store are visibly unavailable. Only the home screen has received the supplied reference-based redesign.
- There is no packaged desktop executable or PeerJS transport yet.

## Source map

| Path | Responsibility |
| --- | --- |
| `public/js/app.js` | Client state, navigation, and current WebSocket connection |
| `public/js/views/` | Home, room lobby, deck builder, Card Forge, and battlefield |
| `public/js/api.js` | Local HTTP API client |
| `server/index.js` | Express routes, art proxy/cache, WebSocket dispatch, and process startup |
| `server/rooms.js` | Room membership, roles, readiness, matches, and filtered broadcasts |
| `server/engine/` | Game state, rules, card database, and declarative effects |
| `server/store.js` | JSON persistence and local settings |
| `shared/deckcode.js` | Deck-code encoding and decoding |
| `data/` | Card catalog, scripts, and the current deck/custom-card snapshot |
| `test/` | Engine tests and deck-code fixtures |

## Planned player experience

1. Download the Windows executable and launch the game without installing Node.js.
2. Choose **Host**, then share a short room code with friends.
3. Friends launch their own copy, choose **Join** or **Spectate**, and enter the code from another internet connection.
4. Select decks, ready up, and play while the host keeps the game open.

The target avoids a paid dedicated game server. It still uses public connection services, with relay assistance where available, and must be validated across real networks. The host owns the active match; host migration is outside the first release.

Development work follows [ROADMAP.md](ROADMAP.md). Run instructions above describe the application available today.
