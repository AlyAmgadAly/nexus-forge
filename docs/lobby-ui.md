# Scenic home lobby

The home screen follows the composition of supplied screenshot 1: a narrow framed left rail, circular player crest, three compact collection counters, a lower-right illustrated play tile, and three bottom shortcuts. Styles are isolated in `public/css/home.css`; the deck builder, table lobby, battlefield, and game engine keep their existing presentation and rules.

## Working actions

- Play opens Create / Join, with the existing private-room flow for 1v1 and 2v2.
- Join supports typed codes, invite links, Enter submission, and spectating.
- Collection and My Decks open the existing deck builder. Card Forge opens the existing administration view.
- The player crest edits the persisted display name. Settings supports entering and exiting full screen, plus Card Forge navigation.
- Connected state updates the visible indicator and disables room actions during disconnection. An active room adds a return shortcut.
- Counts come from the loaded card pool and saved decks. They represent cards, champions, and decks rather than fictional currencies.
- Rewards, Battle Pass, and Store are explicitly disabled and labeled unavailable because those systems do not exist in the project.

## Assets and deliberate substitutes

- `public/assets/lobby-demacia.png` (1672×941): an ImageGen edit of the user-supplied first reference, with its UI removed and the underlying scene continued. It preserves the coastal city, harbor, ships, and seated character. This is a reconstructed background; the original clean game background was not available in the repository.
- `public/assets/lobby-kindred.png` (2048×1024): existing Kindred full artwork, matching the reference's promotional artwork. Source: https://dd.b.pvp.net/7_10_0/set4/en_us/img/cards/04SI005-full.png . The card is already present as `04SI005` in project data.
- Crest and navigation ornaments: small inline SVG substitutes authored locally. Original game UI sprites, trophy render, and frame textures were not available. Borders, bevels, and glows use scoped CSS.
- Typography uses Bahnschrift Condensed on Windows with system fallbacks. No remote font request or new runtime dependency is needed.

Image generation mode: precise-object-edit, using the supplied screenshot as the reference image. Prompt:

> Use case: precise-object-edit. Asset type: clean 16:9 game lobby background artwork. Input image: the supplied Legends of Runeterra home screen is the edit target. Remove ALL user interface and text: the entire dark left navigation bar and gold frame, trophy/avatar at upper left, all top currency counters, upper-right badge, bottom-right promotional card, and all three bottom toolbar buttons. Inpaint those areas with continuous scene artwork. Preserve the original painterly Demacian white-stone coastal city, monumental cliffs and buildings, turquoise harbor and blue-sailed ships, and the blonde armored woman sitting on the foreground stone parapet. Preserve the existing composition, lighting, colors and scale as closely as possible. Fill the removed left bar with natural continuation of the city/parapet. Wide full-screen 16:9 landscape, ideally 1920x1080. No text, no logos, no frames, no icons, no UI elements. This is an environment asset, not a screenshot or UI mockup.

## Verification

- `npm test`: all 12 existing engine tests pass.
- `node --check public/js/views/home.js` and `node --check public/js/app.js`: pass.
- REA browser scenarios verified profile editing, create / leave, join by invite, lower-case code normalization, spectating, returning to an active room, Deck Builder / Card Forge navigation, and entering / exiting full screen. No captured page errors.
- Inspected the rendered home at the reference's 1913×1074 resolution, at 1280×720, and at 390×844. Compared placement, proportions, framing, and scene visibility with screenshot 1. Corrected button font inheritance and live connection state after the initial capture.
- Review artifacts: [desktop home](qa/lobby/home-1913x1074.png), [room panel](qa/lobby/room-panel-1913x1074.png), [mobile home](qa/lobby/home-390x844.png), and [REA scenario results](qa/lobby/verification.json).

Other supplied screens remain references for future work; this change implements the home only.
