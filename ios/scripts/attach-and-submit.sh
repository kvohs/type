#!/bin/bash
# Waits for the newest Type Only build to finish ASC processing, attaches it
# to the "early readers" external group, and submits it for Beta App Review.
set -u
KID=43GN5VN77U
ISS=9df5e017-3a86-4d06-ab78-0442c580ce42
KEYPATH="$HOME/.appstoreconnect/private_keys/AuthKey_43GN5VN77U.p8"
APP_ID=6779778803
GROUP_ID=18d20b68-0603-4ca6-81c3-8ae34067645c

jwt() { KID=$KID ISS=$ISS KEYPATH=$KEYPATH node "$(dirname "$0")/asc-jwt.mjs"; }

echo "waiting for the build to process…"
BUILD_ID=""
for i in $(seq 1 90); do
  RES=$(curl -s -H "Authorization: Bearer $(jwt)" \
    "https://api.appstoreconnect.apple.com/v1/builds?filter%5Bapp%5D=$APP_ID&limit=1&sort=-uploadedDate&fields%5Bbuilds%5D=version,processingState")
  STATE=$(echo "$RES" | python3 -c 'import json,sys
d = json.load(sys.stdin).get("data", [])
print(d[0]["attributes"]["processingState"] if d else "NONE")' 2>/dev/null)
  echo "$(date +%H:%M:%S) $STATE"
  if [ "$STATE" = "VALID" ]; then
    BUILD_ID=$(echo "$RES" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"][0]["id"])')
    break
  fi
  if [ "$STATE" = "FAILED" ] || [ "$STATE" = "INVALID" ]; then
    echo "build processing failed: $STATE"; exit 1
  fi
  sleep 60
done
[ -n "$BUILD_ID" ] || { echo "timed out waiting for processing"; exit 1; }
echo "build is VALID: $BUILD_ID"

echo "attaching build to the early readers group…"
curl -s -w " [%{http_code}]\n" -X POST -H "Authorization: Bearer $(jwt)" -H "Content-Type: application/json" \
  -d "{\"data\":[{\"type\":\"builds\",\"id\":\"$BUILD_ID\"}]}" \
  "https://api.appstoreconnect.apple.com/v1/betaGroups/$GROUP_ID/relationships/builds" | tail -1

echo "submitting for Beta App Review…"
curl -s -w "\n[%{http_code}]\n" -X POST -H "Authorization: Bearer $(jwt)" -H "Content-Type: application/json" \
  -d "{\"data\":{\"type\":\"betaAppReviewSubmissions\",\"relationships\":{\"build\":{\"data\":{\"type\":\"builds\",\"id\":\"$BUILD_ID\"}}}}}" \
  "https://api.appstoreconnect.apple.com/v1/betaAppReviewSubmissions" | tail -4
echo "done"
