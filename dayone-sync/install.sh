#!/bin/bash
#
# Installs the hourly launchd agent that runs dayone-sync.sh.
# Re-run any time after editing config; it reloads the agent.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="${HERE}/dayone-sync.sh"
LABEL="dayone-sync"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
WATCH_DIR="${DAYONE_SYNC_DIR:-${HOME}/DayOneSync}"
LOG_DIR="${WATCH_DIR}/.dayone-sync"

mkdir -p "$(dirname "$PLIST")" "$LOG_DIR" "$WATCH_DIR"
chmod +x "$SCRIPT"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${SCRIPT}</string>
    </array>
    <key>StartInterval</key>
    <integer>3600</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/launchd.out.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/launchd.err.log</string>
</dict>
</plist>
PLIST

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "Installed and loaded: ${LABEL}"
echo "  script:  ${SCRIPT}"
echo "  plist:   ${PLIST}"
echo "  folder:  ${WATCH_DIR}"
echo
echo "Run it right now:   launchctl start ${LABEL}"
echo "Uninstall:          launchctl unload \"${PLIST}\" && rm \"${PLIST}\""
