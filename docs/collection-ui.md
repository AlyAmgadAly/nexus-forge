# Collection and deck builder UI

This source update follows the supplied card collection, region menu, format menu, and filter drawer references. It also centers each deck portrait, name, and separator within its gallery column.

## Routes and behavior

- `#/decks`: card collection with full card faces, search, region, card type, rarity, mana (including 8+), set, sort, and Standard/Eternal filters. The initial page shows 48 cards; Show more appends the next 48.
- `#/collection/decks`: saved deck gallery. Selecting a deck opens its preview; Edit deck opens the builder. Starter decks open as an editable copy.
- `#/deck/new` and `#/deck/:id`: card browser with a deck editor, actual copy counts, mana curve, regions, validation, add/remove, auto-build, save, import/export, duplicate, clear, and delete. The existing API and deck rules remain authoritative.
- Collection browsing and unsaved edits remain open through incoming lobby snapshots. The return crest goes back to the room when one is active.

All enabled cards are available in Nexus Forge. There is no ownership economy: the scope menu therefore offers All cards, In this deck, and Not in deck. Unimplemented cosmetics remain visibly unavailable. Standard filters the pinned card catalog's format metadata; it does not alter room rules.

## Artwork and implementation

Riot cards use their pinned card-face image via `/art/:id?face=1`, retaining the original frame and text proportions. This variant has its own lazy cache and preserves the existing gameplay illustration cache. Custom cards retain the existing card renderer. Images have a name/mana placeholder while loading. Region icons reuse the local assets added for deck selection.

Original client navigation sprites, beveled controls, filter glyphs, and background textures were unavailable. CSS and inline SVG provide deliberate approximations. No new runtime dependencies, unrelated art, or gameplay effects were added.

The layout uses four card columns in the collection and three alongside the desktop editor. Smaller screens reduce the column count; at 390px the editor occupies a separately scrollable bottom pane.

## Verification

- `npm run test:all`: 36 JavaScript source files passed syntax checks; all 24 tests passed.
- The new art regression test uses a local image fixture to verify face proportions, separate cache reuse, preservation of the gameplay illustration, and exposed format metadata.
- Thirteen successful REA scenarios recorded no failed steps and no captured page errors. Coverage includes filters and empty intersections, copy limits, add/remove, auto-build, save, export, import, duplicate/delete, starter copy, card inspection, mobile layout, centered deck gallery, and editing through repeated lobby snapshots.
- Deck CRUD scenarios used an isolated temporary data folder, keeping test decks out of the existing library. Visual QA used 1916×1079, 1280×720, and 390×844 browser viewports.
- `git diff --check` passed.

Screenshots: [collection](qa/collection/cards-1916x1079.png), [builder](qa/collection/builder-1916x1079.png), [filters](qa/collection/filters-1916x1079.png), [regions](qa/collection/regions-1916x1079.png), [mobile builder](qa/collection/builder-390x844.png), and [centered decks](qa/collection/decks-centered-1916x1079.png). [Scenario results](qa/collection/verification.json) retain the evidence identifiers and step outcomes.

This verification used the source service through REA and Microsoft Edge. A new native Electron run, portable release build, and external-network acceptance test were not performed for this UI update. Existing packaged release downloads do not include these uncommitted source changes.
