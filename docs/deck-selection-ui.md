# Deck selection UI

The Play entry on Home now opens `#/play`, a deck gallery based on the supplied Legends of Runeterra references. This change covers deck selection; the existing deck editor, room controls, and battlefield remain the destinations for their respective actions.

## Reference composition

- Full-screen dark stone surface, main navigation rail, secondary play-mode rail, gold heading rule, and circular return crest.
- Four portrait columns at the reference's 1910×1073 resolution, gold frames, red starter/favorite ribbons, real region emblems, deck names, and a scrolling gallery.
- Selecting a deck opens a larger portrait with its regions, card/champion counts, champion names, Favorite, Edit, and a gold confirmation action. Narrow layouts use fewer columns and an overlaid preview.

## Working behavior

- The gallery reads saved decks and the enabled card index. Covers prefer a champion matching the deck's regions, then another champion or available unit/card. Auto Deck remains available at the end of the gallery.
- Search matches deck, champion, and region names. Favorites persist on this device under `nf.deckFavorites`.
- Before joining a room, confirmation creates a room with the chosen deck. Cancelling the display-name prompt restores the action.
- In an existing room, confirmation equips the deck through the existing host/local action or desktop guest deck-submission path, then returns to the room. The room also has a Choose deck link.
- Spectators, started matches, pending custom-content approval, and disconnected clients cannot confirm a deck.
- Live room snapshots preserve the picker route, selected preview, search, scroll position, and keyboard focus. The close control and Escape dismiss the preview.
- Editing a starter opens the existing editor's copy workflow. Unsupported modes and services are visibly unavailable.

## Assets and substitutes

Card covers use the existing `/art/:id` endpoint and saved card data. The eleven region icons in `public/assets/regions/` come from the pinned Riot 7.10.0 core assets at `https://dd.b.pvp.net/7_10_0/core/en_us/img/regions/`; filenames follow the existing card-data region URLs.

Original LoR frame sprites, mode illustrations, and stone textures were not available. Frames, ribbons, texture, bevels, and glow are CSS approximations; the navigation reuses the existing inline SVG ornaments. No unrelated artwork, remote fonts, or new runtime dependencies were added.

## Verification

- `npm run test:all`: 35 JavaScript files passed syntax validation; all 23 existing automated tests passed.
- `git diff --check`: passed.
- Seven successful REA browser scenarios: reference-resolution gallery and preview, 390×844 preview, Home-to-room deck creation/switching, guest selection during live room snapshots, spectator restrictions, and cancellation/favorite/edit-copy behavior. No failed steps or captured page errors in these successful runs.
- The room flow verified the actual equipped dropdown value for Frost & Flame, Auto Deck, and Tides of the Peak. Fixture rooms were ephemeral; saved decks were not changed by these scenarios.
- Visual checks compared rail widths, portrait proportions, spacing, gold framing, and selected-deck layout with the supplied references. The scoped stylesheet avoids changing the editor or battlefield.

Review artifacts: [gallery](qa/deckselection/gallery-1910x1073.png), [selected deck](qa/deckselection/selected-1910x1073.png), [narrow preview](qa/deckselection/selected-390x844.png), and [scenario results](qa/deckselection/verification.json).

The initial runtime verification above used the source service on loopback with Microsoft Edge through REA. The subsequent [selected-deck and left editor update](deck-editor-ui.md) rebuilt the local portable UI preview and verified it in packaged Electron. External-network acceptance testing remains separate. The desktop guest submission path reuses the existing implementation; the recorded guest browser scenario exercised the local WebSocket path.
