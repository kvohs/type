#!/bin/bash
#
# dayone-sync — sync a folder of notes into Day One on a schedule.
#
# Watches a folder for .md / .txt notes, creates a Day One entry from each via
# the official `dayone` CLI, confirms the entry actually landed in Day One's
# database, then archives (or deletes) the local file. Built to pair with the
# `type` writing app, but works with any folder of plain-text/markdown notes.
#
# macOS only. Requires Day One for Mac and its CLI:
#   sudo bash "/Applications/Day One.app/Contents/Resources/install_cli.sh"
#
# The scheduled launchd agent uses the values written below. (Environment
# variables override them, but only affect manual runs — launchd won't see them.)

set -uo pipefail

# ---- config ---------------------------------------------------------------
WATCH_DIR="${DAYONE_SYNC_DIR:-${HOME}/DayOneSync}"   # folder of notes to sync
JOURNAL="${DAYONE_SYNC_JOURNAL:-}"                   # Day One journal name ("" = your default journal)
TAG="${DAYONE_SYNC_TAG:-}"                           # tag added to every entry ("" = none)
ON_SUCCESS="${DAYONE_SYNC_ON_SUCCESS:-archive}"      # once confirmed in Day One:
                                                     #   archive -> move file to _synced/ (safe default)
                                                     #   delete  -> remove the local file
                                                     #   keep    -> leave it (tracked so it won't re-post)
EXTENSIONS="${DAYONE_SYNC_EXT:-md txt}"              # space-separated file extensions to sync
MIN_AGE_SECS="${DAYONE_SYNC_MIN_AGE:-60}"           # ignore files modified within the last N secs
# ---------------------------------------------------------------------------

DAYONE_BIN="$(command -v dayone || echo /usr/local/bin/dayone)"
SQLITE_BIN="$(command -v sqlite3 || echo /usr/bin/sqlite3)"
LOG_DIR="${WATCH_DIR}/.dayone-sync"
LOG_FILE="${LOG_DIR}/synced.log"
ERR_FILE="${LOG_DIR}/errors.log"
STATE_FILE="${LOG_DIR}/synced.state"   # remembers files synced in "keep" mode
ARCHIVE_DIR="${WATCH_DIR}/_synced"

mkdir -p "$LOG_DIR"
ts() { date '+%Y-%m-%d %H:%M:%S'; }

# Day One's local store; real entries' UUIDs live in ZENTRY.ZUUID.
DB="$(ls "${HOME}/Library/Group Containers/"*dayoneapp2*/Data/Documents/DayOne.sqlite 2>/dev/null | head -n1)"

in_dayone() {   # true only if the UUID is a stored entry in Day One's database
  local u="$1" n
  [ -n "$DB" ] && [ -x "$SQLITE_BIN" ] || return 1
  n="$("$SQLITE_BIN" "file:${DB}?mode=ro" "SELECT count(*) FROM ZENTRY WHERE ZUUID='${u}';" 2>/dev/null)"
  [ "${n:-0}" -gt 0 ]
}

# ---- preconditions (fail safe: never remove a file on a bad setup) ---------
[ -x "$DAYONE_BIN" ] || { echo "$(ts) ERROR dayone CLI not found -- install Day One CLI (see README)" >> "$ERR_FILE"; exit 1; }
[ -d "$WATCH_DIR" ]  || { echo "$(ts) ERROR watch dir missing: $WATCH_DIR" >> "$ERR_FILE"; exit 1; }
if [ "$ON_SUCCESS" != "keep" ] && [ -z "$DB" ]; then
  echo "$(ts) ERROR DayOne.sqlite not found -- cannot confirm entries, refusing to remove files" >> "$ERR_FILE"; exit 1
fi
[ "$ON_SUCCESS" = "archive" ] && mkdir -p "$ARCHIVE_DIR"

now="$(date +%s)"
shopt -s nullglob

# Gather candidate files for the configured extensions.
files=()
for ext in $EXTENSIONS; do
  for f in "$WATCH_DIR"/*."$ext"; do files+=("$f"); done
done

for f in "${files[@]}"; do
  base="$(basename "$f")"

  # Skip files still being written.
  mt="$(stat -f %m "$f" 2>/dev/null || echo 0)"
  [ $(( now - mt )) -lt "$MIN_AGE_SECS" ] && continue

  # In "keep" mode, skip files we've already posted.
  if [ "$ON_SUCCESS" = "keep" ] && grep -qxF "$base" "$STATE_FILE" 2>/dev/null; then
    continue
  fi

  # ---- derive entry date ----
  d=""
  # 1) date (+ optional time) embedded in the filename, e.g. 2026-06-05-14-30 or 2026_06_05
  if [[ "$base" =~ ([0-9]{4})[-_]([0-9]{2})[-_]([0-9]{2})([-_T]([0-9]{2})[-_:]([0-9]{2}))? ]]; then
    d="${BASH_REMATCH[1]}-${BASH_REMATCH[2]}-${BASH_REMATCH[3]}"
    [ -n "${BASH_REMATCH[5]}" ] && d="$d ${BASH_REMATCH[5]}:${BASH_REMATCH[6]}:00"
  fi
  # 2) a `date:` line in YAML frontmatter (first 40 lines)
  if [ -z "$d" ]; then
    fdate="$(awk -F': *' 'NR>40{exit} tolower($1)=="date"{gsub(/["'\''[:space:]]/,"",$2); print $2; exit}' "$f")"
    [ -n "$fdate" ] && d="$fdate"
  fi
  # 3) fall back to the file's modification time
  [ -z "$d" ] && d="$(date -r "$f" '+%Y-%m-%d %H:%M:%S')"

  # ---- body: strip a leading YAML frontmatter block, keep the prose ----
  body="$(awk 'BEGIN{fm=0}
              NR==1 && $0=="---"{fm=1; next}
              fm==1 && $0=="---"{fm=0; next}
              fm==0{print}' "$f")"

  if [ -z "${body//[[:space:]]/}" ]; then
    echo "$(ts) SKIP empty $base" >> "$ERR_FILE"; continue
  fi

  # ---- build CLI args ----
  args=()
  [ -n "$JOURNAL" ] && args+=(-j "$JOURNAL")
  args+=(-d "$d")
  [ -n "$TAG" ] && args+=(-t "$TAG" --)

  out="$(printf '%s' "$body" | "$DAYONE_BIN" "${args[@]}" new 2>&1)"; rc=$?
  uuid="$(printf '%s' "$out" | sed -nE 's/.*[Uu]uid:?[[:space:]]*([0-9A-Za-z-]{8,}).*/\1/p' | head -n1)"

  # ---- confirmation gate: exit 0, a UUID came back, and (unless keeping)
  #      that UUID is really in Day One's database ----
  if [ "$rc" -eq 0 ] && [ -n "$uuid" ] && { [ "$ON_SUCCESS" = "keep" ] || in_dayone "$uuid"; }; then
    echo "$(ts) OK $base -> $uuid" >> "$LOG_FILE"
    case "$ON_SUCCESS" in
      delete)  rm -f "$f" ;;
      archive) mv -f "$f" "$ARCHIVE_DIR/" ;;
      keep)    echo "$base" >> "$STATE_FILE" ;;
    esac
  else
    echo "$(ts) FAIL $base rc=$rc uuid=${uuid:-none} out=$(printf '%s' "$out" | tr '\n' ' ')" >> "$ERR_FILE"
  fi
done
