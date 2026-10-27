# Left deck editor and selected-deck controls

The editor now follows the supplied reference: a navy deck list on the left, compact illustrated rows with mana cost and copy count, and a four-column card library on the right at desktop sizes. The footer stays at the bottom while the deck list scrolls. Narrow layouts keep the deck on the left and reduce the library column count.

Hovering a deck row or library card shows its full card face, including text and stats. Keyboard focus also opens the preview; Escape dismisses a focused preview. Clicking a deck row removes one copy, and clicking a library card adds one within the existing region and copy rules. The Inspect control remains available for touch use.

The first header icon opens the existing deck tools (load, new, auto-build, clear, import/export, save, duplicate and delete). The second opens mana curve and rule details. Done saves a legal deck and returns to its selected preview. Editing a starter saves a personal copy; editing a personal deck updates it. The selected preview has Favorite and Edit beside its portrait, with Play below. Favorites persist on the device.

The footer reports actual champion, card and region counts. This update preserves existing game rules; it does not introduce a champion limit or an ownership economy. Card faces, illustrations and region icons reuse existing data and assets. Frames, buttons and decorative icons remain CSS/SVG approximations of the reference.

## Verification

- All 24 automated tests passed; syntax checks passed for 36 files. `git diff --check` passed.
- Nine interaction-check groups passed against both the source app and the actual portable EXE, with isolated temporary data. They verify left-rail placement, four columns, full-face pointer hover, one-copy add/remove, legality controls, tools/filters, starter-copy saving, existing-deck updates, and narrow layout. No captured page errors occurred.
- Four successful REA scenarios cover keyboard previews, new-deck auto-build/save/selection, mobile selected-deck controls, and the packaged editor. Results are recorded in [verification.json](qa/deck-editor/verification.json), [source interaction checks](qa/deck-editor/interaction-checks.json), and [packaged interaction checks](qa/deck-editor/native-interaction-checks.json).
- Visual checks used 1918×1079 and 390×844. Screenshots: [left deck and hover](qa/deck-editor/left-deck-hover-1918x1079.png), [selected deck](qa/deck-editor/selected-deck-1918x1079.png), [mobile editor](qa/deck-editor/left-deck-builder-390x844.png), and [packaged hover](qa/deck-editor/native-hover-1918x1079.png). The full native screenshots use direct CDP capture; REA's connected Electron screenshot included padding outside the native content area.

The rebuilt local `NexusForge-0.2.0-ui-preview-portable.exe` is 121,438,754 bytes and uses Electron 45.0.0. Its SHA256 is `20E70019AA4F01E7DDC48509EF6373F5F7EFB22F5EDF910F09859336CA673BFB`. The EXE remains unsigned. External-network multiplayer testing is separate from this UI verification.
