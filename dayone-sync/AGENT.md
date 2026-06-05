# dayone-sync — setup instructions for a coding agent

You are setting up **dayone-sync** on a macOS machine for your user. It turns a
folder of `.md`/`.txt` notes into Day One entries on an hourly schedule, and
removes each local file only after confirming the entry exists in Day One's
database. Follow these steps. Do not skip the confirmation checks.

## 0. Confirm the platform
- This is macOS-only and needs the Day One Mac app. If either isn't true, stop
  and tell the user.

## 1. Ask the user three things
1. **Which folder** should be watched? (default `~/DayOneSync`)
2. **Which Day One journal** should entries go to? (blank = their default journal)
3. **After a note syncs, should the file be** `archive` (move to `_synced/`),
   `delete`, or `keep`? Default to `archive` unless they say otherwise.
   - If they choose `delete`, confirm they understand the local file is removed
     and the writing will live only in Day One.

## 2. Install the Day One CLI (if missing)
```sh
ls -l /usr/local/bin/dayone 2>/dev/null \
  || sudo bash "/Applications/Day One.app/Contents/Resources/install_cli.sh"
```
The install needs `sudo` — the user must run/approve it. Verify afterward that
`/usr/local/bin/dayone` exists.

## 3. Configure the script
Edit the config block at the top of `dayone-sync.sh` with the user's answers:
`WATCH_DIR`, `JOURNAL`, `TAG` (optional), `ON_SUCCESS`. Create the watch folder
if it doesn't exist.

## 4. Verify before trusting it (important)
Do a real end-to-end test so deletion/archiving is proven safe:
```sh
# write a throwaway note into the watch dir, with a past timestamp so it isn't
# skipped by the "still being written" guard:
printf 'dayone-sync test. safe to delete.\n' > "$WATCH_DIR/test-2020-01-01-00-00.md"
touch -t 202001010000 "$WATCH_DIR/test-2020-01-01-00-00.md"

./dayone-sync.sh
cat "$WATCH_DIR/.dayone-sync/synced.log"   # expect: OK test-... -> <uuid>
```
Confirm: (a) `synced.log` shows an `OK` line with a UUID, and (b) the file was
archived/deleted/kept per the chosen mode. Check `errors.log` if not.
Tell the user the test created one real Day One entry they can delete in the app
(the CLI cannot delete entries).

## 5. Install the hourly agent
```sh
./install.sh
launchctl list | grep dayone-sync   # confirm it's loaded
```

## 6. Report to the user
- Where the script + plist live, the watch folder, the journal, and the
  `ON_SUCCESS` mode.
- That cloud sync happens when they open Day One (CLI entries are picked up on
  app relaunch), and that the local file is only ever removed after the entry is
  confirmed in Day One's database.
- How to uninstall (`launchctl unload …` then remove the plist).

## Notes / gotchas
- The launchd agent runs with launchd's environment, so it uses the values
  written *in the script*, not shell env vars. Configure by editing the script.
- Confirmation reads `~/Library/Group Containers/*dayoneapp2*/Data/Documents/DayOne.sqlite`
  (`SELECT count(*) FROM ZENTRY WHERE ZUUID=...`). If that DB can't be found and
  the mode isn't `keep`, the script refuses to remove any file.
- Files modified within `MIN_AGE_SECS` (default 60s) are skipped to avoid
  grabbing a half-written note.
