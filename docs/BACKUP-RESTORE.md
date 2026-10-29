# Back up and restore Imagination Is All You Need

Everything Imagination Is All You Need saves stays on your own computer (or in your own Docker volume). There's no account and no cloud copy, so **a backup is your only copy**. This page covers where your data lives, the one-file export and import, backing up by hand, and the settings that clean things up automatically.

## 1. Where your data lives

| What | Default location | Change it with |
|---|---|---|
| **Database**: your history, jobs, credit ledger, favourites, projects, elements, and settings such as routing choices | `server/data/openhiggsfield.db`, plus two helper files next to it (`openhiggsfield.db-wal` and `openhiggsfield.db-shm`) | `OPENHIGGSFIELD_DATA_DIR` |
| **Your files**: uploads, results (videos, images, audio), frames you grabbed | the same `server/data/` folder | `OPENHIGGSFIELD_DATA_DIR` |
| **Caches**: video posters and thumbnails (rebuilt when needed) | `server/data/posters/`, `server/data/thumbs/` | (inside the data folder) |
| **Provider keys** | `.env.local` in the main project folder (next to `package.json`) | `OPENHIGGSFIELD_ENV_FILE` |
| **Plugins you added** | `plugins/` in the main project folder | `OPENHIGGSFIELD_PLUGINS_DIR` |
| **Logs** | not saved to a file; they print in the terminal where the app runs (Docker: `docker compose logs`) | — |
| **ComfyUI models and ComfyUI's own output folder** | your ComfyUI install (e.g. `ComfyUI/models`, `ComfyUI/output`) | your ComfyUI settings |

**With Docker**, the app keeps everything in `/data` inside the container, which is stored in the `openhiggsfield_ohf-data` volume. That includes the database, your files **and your saved keys** (`/data/.env.local`), so `docker compose down` / `up` and rebuilding the image keep all of them. Keys you set under `environment:` in the compose file take priority over the saved file. ComfyUI models and output are in separate volumes (`openhiggsfield_comfy-models`, `openhiggsfield_comfy-output`); models can be downloaded again instead of backed up.

> **Warning:** `npm run demo:reset` **deletes everything** in the data folder and fills it with demo items. Back up first.

## 2. Export and import (one file)

### In the app
Open **Settings → Back up / restore**:
- **Export library** downloads your whole library as one `.tar.gz` file; **Export without media** leaves out the media files (much smaller).
- **Import backup…** lets you pick a saved export. The app asks you to confirm (you can **Export first**), checks the file, then shows **"Restart Imagination Is All You Need to switch to this backup. Your current library is kept in a backup folder."** Restart it yourself (step 3 below).

The same works from a terminal, as shown next.

### Export
One `.tar.gz` file with your whole library: the database (history, credit ledger, projects, favourites, elements, settings) and your media files.

```bash
APP=http://localhost:8080      # where you open the app (dev mode: http://localhost:5174)
curl -OJ "$APP/api/export"           # → openhiggsfield-export-YYYY-MM-DD.tar.gz
curl -OJ "$APP/api/export?media=0"   # database only, without media files (much smaller)
```

- The export is safe to make while the app is running: the database is copied with SQLite's own backup method.
- Inside the file: `manifest.json` (format `openhiggsfield-export`, version 1, item counts, and how many media entries and bytes are included), `openhiggsfield.db` and your media.
- **Left out:** caches that are rebuilt automatically (thumbnails, posters), old pre-import backups, and hidden files. **Your keys are not in the export:** `.env.local` is never included, and keys aren't stored in the database. Back up `.env.local` separately if you want to keep your keys (section 5).
- The database does contain your prompts, history and any webhook addresses you registered, so keep exports private anyway.

### Import
```bash
curl -X POST "$APP/api/import" \
  -H "Content-Type: application/gzip" \
  --data-binary @openhiggsfield-export-YYYY-MM-DD.tar.gz
```

1. The app checks the file: it must be an Imagination Is All You Need export, contain no unsafe paths, and have a healthy database. If the file isn't valid, nothing changes and you get an error explaining why. If no file is sent, it answers "Send the export file (.tar.gz) as the request body."
2. If the check passes, the backup is **staged** and the answer says `"restartRequired": true`. **Nothing switches over yet.**
3. **Restart the app yourself** (Ctrl+C and start it again, or `docker compose restart`). It doesn't restart on its own.
4. On that start, before the database opens:
   - your current database is moved to `server/data/backups/pre-import-<date and time>/`, so you can go back;
   - the backup's database takes its place;
   - the backup's media files are copied in. A file with the same name is overwritten; nothing else is deleted, so files already in your data folder stay.
5. Check History, Assets and Usage. If the import couldn't be applied, the terminal says so and your current library stays as it was.

**Going back after an import:** stop the app, copy `openhiggsfield.db` (and any `-wal` / `-shm` files) from the `backups/pre-import-…/` folder back into the data folder, then start the app.

**Prefer buttons?** Settings → Back up / restore does the same export and import (see "In the app" above); you still restart the app yourself after an import.

## 3. Back up by hand

### Option A, simplest: stop the app, then copy
1. Stop Imagination Is All You Need (press Ctrl+C in its terminal, or `docker compose stop`).
2. Copy these to a safe place:
   - the whole data folder (`server/data/`, or wherever `OPENHIGGSFIELD_DATA_DIR` points), **including** `openhiggsfield.db`, `openhiggsfield.db-wal` and `openhiggsfield.db-shm`;
   - `.env.local` (your keys; see section 5);
   - `plugins/`, if you added your own plugins.
3. Start the app again.

### Option B: copy the database while the app is running
Copying only the `.db` file while the app runs can give you a broken or out-of-date copy. Use SQLite's own backup instead (or the export in section 2):

```bash
sqlite3 server/data/openhiggsfield.db ".backup 'openhiggsfield-backup.db'"
```

Without the `sqlite3` tool, from the `server` folder:
```bash
node -e "require('better-sqlite3')('data/openhiggsfield.db').backup('../openhiggsfield-backup.db').then(() => console.log('done'))"
```

Then copy the rest of the data folder as usual.

### Docker
Stop the app, then pack the data volume into a `.tar.gz` file in your current folder:
```bash
docker compose stop
docker run --rm -v openhiggsfield_ohf-data:/data -v "$PWD":/backup alpine tar czf /backup/ohf-data.tar.gz -C /data .
docker compose start
```
This copy **includes your saved keys** (`/data/.env.local`).

## 4. Restore a hand-made backup

1. Stop Imagination Is All You Need.
2. Put the files back:
   - copy the data folder contents back into `server/data/` (or your `OPENHIGGSFIELD_DATA_DIR`);
   - if you made an Option B database copy, rename it to `openhiggsfield.db` and **delete** any old `openhiggsfield.db-wal` / `-shm` files in the folder before you start;
   - put `.env.local` back in the main project folder, and `plugins/` if you backed it up.
3. Start the app. Your history, Assets and credit ledger should be back.

**Docker:**
```bash
docker compose stop
docker run --rm -v openhiggsfield_ohf-data:/data -v "$PWD":/backup alpine sh -c "rm -rf /data/* && tar xzf /backup/ohf-data.tar.gz -C /data"
docker compose start
```

**Moving to a new folder or a fresh copy?** Copy `server/data/` and `.env.local` across, or point the new copy at the old data with `OPENHIGGSFIELD_DATA_DIR=/path/to/old/server/data`.

**Upgrading an older install (from before the rename)?** Nothing to do: an old `openjutsu.db` is renamed to `openhiggsfield.db` the first time the app starts, and old `OPENJUTSU_…` settings still work.

## 5. Your keys: keep them private

- Provider keys (Comfy, fal, Replicate and others) are stored as plain text in **`.env.local`** (Docker: `/data/.env.local` on the data volume). The Settings page never shows a key, only whether it's set.
- The install script makes `.env.local` readable only by your user account. Re-running it **merges** into the file: it updates only the settings it writes, so keys you saved stay.
- **The export (section 2) never contains your keys.** A hand-made copy that includes `.env.local`, or a Docker volume backup, **does**. Store those somewhere private, don't upload them anywhere public, and if one leaks, revoke the keys with the provider and create new ones.
- Result ZIPs from Assets don't contain keys.

## 6. Automatic cleanup

Two settings can delete things on their own. Set them in `.env.local` (or your Docker environment), then restart the app.

| Setting | Default | What it does |
|---|---|---|
| `OPENHIGGSFIELD_TRASH_DAYS` | **30** | Deleted items go to **Trash** first. After this many days in Trash they're **deleted for good**: the history entry, its result files, its uploaded inputs and its thumbnails (files another item still uses are kept). Checked when the app starts and every hour. `0` = never empty Trash automatically. A value that isn't a number of 0 or more prints a warning and uses 30. |
| `OPENHIGGSFIELD_RESULT_TTL_DAYS` | **0** (off) | Above 0, finished results older than this many days are **moved to Trash** automatically (checked every hour), then deleted for good after `TRASH_DAYS`. |

- **Your credit ledger is kept.** Emptying Trash never removes ledger entries, so Usage stays complete.
- Not cleaned automatically: posters and other caches, and files that aren't linked to any item.

### Unlinked files: report, set aside, put back
A helper script lists files in your data folder that no item uses (for example uploads from runs that never started). It only reports by default. Run it from the `server` folder, with the app stopped or idle:

```bash
cd server
npx tsx scripts/orphan-uploads.ts --data /path/to/openhiggsfield/server/data                    # report only; changes nothing
npx tsx scripts/orphan-uploads.ts --data /path/to/openhiggsfield/server/data \
  --apply --yes --quarantine /path/to/quarantine-folder                                        # move unlinked uploads aside
npx tsx scripts/orphan-uploads.ts --data /path/to/openhiggsfield/server/data \
  --restore --quarantine /path/to/quarantine-folder                                            # put them all back
```

- `--apply --yes` **moves** files (nothing is deleted) into the quarantine folder, keeping their paths, and lists them in `manifest.json` there. By default it moves only unlinked uploads and pre-check files; files newer than 30 minutes are skipped.
- `--restore` moves every file listed in that folder's `manifest.json` back into the data folder given with `--data`. A file whose original path exists again is skipped. Use the same `--quarantine` folder you moved them to.
- Always pass `--quarantine` with a folder you choose; the script's built-in default is a development path.
- Back up before turning on `RESULT_TTL_DAYS` or lowering `TRASH_DAYS`: items deleted for good can only come back from a backup.

## 7. Results as ZIP files

You can also download **results** as ZIP files from Assets (one result, or several selected). Each ZIP has the output files plus a `settings.json` (tool, model, prompt, seed and so on; never your keys). ZIPs are good for sharing or keeping results, but they aren't a full backup: they can't be imported, and they don't include your ledger, projects or settings. Use the export for that.
