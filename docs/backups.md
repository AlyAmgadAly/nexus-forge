# Backups and recovery

Nexus Forge never upgrades `scripts.json` in place without first writing a
backup. This guide explains where those files live and how to restore them.

## Where backups are written

In the desktop app, user data lives under:

```text
%APPDATA%\Nexus Forge\
```

In browser/development mode, it is the project `data/` directory. Backups are
written under `backups/` inside the user-data directory:

| File pattern | Created by | Contains |
| --- | --- | --- |
| `scripts-upgrade-<timestamp>.json` | `store.init()` seed upgrade | The complete `scripts.json` before the merge |
| `scripts-corrupt-<timestamp>.json` | `store.init()` corrupt-file recovery | The raw unreadable `scripts.json` |
| `scripts-batch-<timestamp>.json` | `npm run scripts:apply` | The complete `scripts.json` before the batch merge |
| `scripts-autoscript-<timestamp>.json` | `npm run autoscript -- --write` | The complete `scripts.json` before regeneration |
| `data-<timestamp>/legacy/` | First-launch data migration | A copy of every writable legacy file and art |
| `data-<timestamp>/target/` | First-launch data migration | Any target files that were about to be overwritten |

`scripts-upgrade.json` records the last merge report, including `backupFile`,
`added`, `upgraded`, `metadataUpdated`, `kept`, `excluded`, and `userOnly`.
It is a report, not a backup; do not rely on it to restore scripts.

## Restore a scripts backup

1. Close Nexus Forge. Do not edit files while the app is running.
2. Open the user-data folder and locate `backups/`.
3. Copy the backup you want to restore over `scripts.json`.
4. Decide whether to keep the current seed version:
   - To stay on the restored scripts and skip automatic re-upgrade, keep
     `scripts-upgrade.json` as it is.
   - To let the next launch merge the current packaged seed again, rename or
     delete `scripts-upgrade.json`. The merge will still preserve `custom` and
     locally modified entries, but it may upgrade unmodified `auto`/`partial`
     entries.
5. Start the app and check `scripts-upgrade.json` for the new report.
6. Run a game or open Card Forge and confirm the restored cards behave as
   expected.

The merge never deletes `custom` entries. If a restore is meant to recover a
custom script, verify it appears under the card in Card Forge after launch.

## Recover a corrupt `scripts.json`

If `scripts.json` is not valid JSON, startup writes the raw file to
`backups/scripts-corrupt-<timestamp>.json` and installs the packaged seed. To
recover entries from the corrupt file:

1. Open the corrupt backup in a text editor and fix the JSON syntax, or extract
   the entries you need.
2. Merge those entries into the current `scripts.json` with
   `npm run scripts:apply -- <batch.json>` or the Card Forge editor.
3. Do not overwrite the current file with the corrupt one.
4. Restart and confirm the scripts load.

Custom-card IDs that are not in the pinned `data/cards.json` catalog are kept in
local user data but excluded from packaged seed builds. Do not delete them just
because the package does not contain them.

## Recover a failed migration

`prepareUserData()` writes a complete `data-<timestamp>/legacy/` backup before
copying legacy files. To roll back:

1. Close the app.
2. Copy the files from `backups/data-<timestamp>/legacy/` back into the
   user-data directory.
3. Copy `backups/data-<timestamp>/target/` back only if you need the previous
   target files; it contains the files that were about to be overwritten.
4. Remove `.migration.json` only if you intentionally want the migration to run
   again. Keep it if the restored data is already correct.

## Verification metadata after a restore

`curated` entries carry a normalized card-text hash. If a restored script was
verified against different printed text, reports show it as `partial` rather
than verified. Re-review the card and update the verification metadata; do not
mark it `curated` just because the JSON restored successfully.

## Related commands

```powershell
npm run scripts:apply -- scripts/batches/<batch-id>.json --check
npm run autoscript -- --check
npm run scripts:coverage
npm run scripts:lint
```

`--check` and `--out` are read-only. `--write` and `scripts:apply` without
`--check` create a backup before writing.
