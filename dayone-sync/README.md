# dayone-sync

Sync a folder of notes into [Day One](https://dayoneapp.com) on a schedule.

Drop Markdown/text files in a folder; once an hour each one becomes a Day One
entry, dated from the note itself. The local file is only removed **after** the
entry is confirmed in Day One's database, so you never lose writing to a failed
sync. Built to pair with the [`type`](https://github.com/kvohs/type) writing
app, but it works with any folder of `.md` / `.txt` notes.

macOS only.

## Why this is safe

Day One's CLI is write-only — it can create entries but can't read, list, or
delete them. So after creating an entry, this tool reads back the UUID the CLI
returns and **looks it up in Day One's local database** (`DayOne.sqlite`). Only
if the entry is really there does it touch your file. Any failure leaves the
file in place to retry next run.

> Note: it confirms the entry is in Day One *on your Mac*. The cloud push is
> Day One's own job (open the app to let it sync). The CLI-written entries are
> only picked up by a running Day One after a relaunch, which is why cloud
> arrival can't be used as the gate.

## Requirements

1. **Day One for Mac** installed.
2. **Day One CLI** installed:
   ```sh
   sudo bash "/Applications/Day One.app/Contents/Resources/install_cli.sh"
   ```
   This puts `dayone` at `/usr/local/bin/dayone`.

## Setup

```sh
# 1. clone / copy this folder somewhere stable, then:
cd dayone-sync

# 2. edit the config block at the top of dayone-sync.sh:
#    WATCH_DIR   - the folder to watch (default ~/DayOneSync)
#    JOURNAL     - Day One journal name ("" = your default journal)
#    TAG         - tag on every entry ("" = none)
#    ON_SUCCESS  - archive | delete | keep  (default: archive)

# 3. try it once by hand:
./dayone-sync.sh
cat "$HOME/DayOneSync/.dayone-sync/synced.log"

# 4. install the hourly background agent:
./install.sh
```

That's it. Save notes into the folder; they show up in Day One within the hour.

## What it does with each file (`ON_SUCCESS`)

- `archive` *(default)* — move the file to a `_synced/` subfolder. Nothing lost.
- `delete` — remove the local file. It now lives only in Day One.
- `keep` — leave the file (tracked so it won't post twice).

## How a note becomes an entry

- **Date/time:** taken from a `YYYY-MM-DD` (optionally `…-HH-MM`) in the
  filename, else a `date:` line in YAML frontmatter, else the file's modified
  time.
- **Body:** a leading `---` YAML frontmatter block is stripped; the rest is the
  entry text (Day One uses the first line as the title).
- **Journal / tag:** as configured.

## Logs

Inside `<WATCH_DIR>/.dayone-sync/`:

- `synced.log` — every confirmed entry (`OK <file> -> <uuid>`)
- `errors.log` — anything skipped or failed (file kept)
- `launchd.out.log` / `launchd.err.log` — raw agent output

## Uninstall

```sh
launchctl unload "$HOME/Library/LaunchAgents/dayone-sync.plist"
rm "$HOME/Library/LaunchAgents/dayone-sync.plist"
```

## Want an AI to set it up for you?

Hand [`AGENT.md`](AGENT.md) to a coding agent (Claude Code, etc.) — it has
step-by-step setup instructions written for an agent to follow.

## License

MIT — use it however you like.
