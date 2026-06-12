#!/bin/bash
# Polls ASC until the newest build for Type Only (6779778803) finishes
# processing. Prints state transitions; exits when VALID / FAILED / INVALID.
set -u
KID=43GN5VN77U
ISS=9df5e017-3a86-4d06-ab78-0442c580ce42
KEYPATH="$HOME/.appstoreconnect/private_keys/AuthKey_43GN5VN77U.p8"

while true; do
  JWT=$(KID=$KID ISS=$ISS KEYPATH=$KEYPATH node "$(dirname "$0")/asc-jwt.mjs")
  STATE=$(curl -s -H "Authorization: Bearer $JWT" \
    "https://api.appstoreconnect.apple.com/v1/builds?filter%5Bapp%5D=6779778803&limit=1&fields%5Bbuilds%5D=version,processingState" \
    | python3 -c 'import json,sys
d = json.load(sys.stdin).get("data", [])
print((d[0]["attributes"]["processingState"] + " build " + d[0]["attributes"]["version"]) if d else "NONE")' 2>/dev/null)
  echo "$(date +%H:%M:%S) ${STATE:-poll-error}"
  case "${STATE:-}" in
    VALID*|FAILED*|INVALID*) exit 0 ;;
  esac
  sleep 60
done
