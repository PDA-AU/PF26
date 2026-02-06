#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8001}"
API="${BASE_URL%/}/api"

echo "[1/9] Health"
curl -fsS "$API/health" >/dev/null

echo "[2/9] Routes endpoint available"
ROUTES_JSON="$(curl -fsS "$API/routes")"

echo "[3/9] PDA route contract entries present"
echo "$ROUTES_JSON" | grep -q '"/pda/programs"' || { echo "Missing /pda/programs"; exit 1; }
echo "$ROUTES_JSON" | grep -q '"/pda/events"' || { echo "Missing /pda/events"; exit 1; }
echo "$ROUTES_JSON" | grep -q '"/pda/team"' || { echo "Missing /pda/team"; exit 1; }
echo "$ROUTES_JSON" | grep -q '"/pda/gallery"' || { echo "Missing /pda/gallery"; exit 1; }

echo "[4/9] PDA programs endpoint"
curl -fsS "$API/pda/programs?limit=60" >/tmp/pda_programs.json
python3 - <<'PY'
import json
with open('/tmp/pda_programs.json') as f:
    data=json.load(f)
assert isinstance(data, list), "Programs response is not a list"
assert len(data) <= 60, "Programs limit not respected"
print("Programs count:", len(data))
PY

echo "[5/9] PDA events endpoint"
curl -fsS "$API/pda/events?limit=60" >/tmp/pda_events.json
python3 - <<'PY'
import json
with open('/tmp/pda_events.json') as f:
    data=json.load(f)
assert isinstance(data, list), "Events response is not a list"
assert len(data) <= 60, "Events limit not respected"
print("Events count:", len(data))
PY

echo "[6/9] PDA team endpoint"
curl -fsS "$API/pda/team" >/tmp/pda_team.json
python3 - <<'PY'
import json
with open('/tmp/pda_team.json') as f:
    data=json.load(f)
assert isinstance(data, list), "Team response is not a list"
print("Team count:", len(data))
PY

echo "[7/9] PDA gallery endpoint"
curl -fsS "$API/pda/gallery?limit=200" >/tmp/pda_gallery.json
python3 - <<'PY'
import json
with open('/tmp/pda_gallery.json') as f:
    data=json.load(f)
assert isinstance(data, list), "Gallery response is not a list"
assert len(data) <= 200, "Gallery limit not respected"
print("Gallery count:", len(data))
PY

echo "[8/9] Featured event endpoint"
HTTP_CODE="$(curl -s -o /tmp/pda_featured.json -w '%{http_code}' "$API/pda/featured-event")"
if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "404" ]]; then
  echo "Unexpected status from /pda/featured-event: $HTTP_CODE"
  exit 1
fi

echo "[9/9] Frontend route declarations (static check)"
grep -q 'path="/"' frontend/src/App.js || { echo "Missing / route in App.js"; exit 1; }
grep -q 'path="/login"' frontend/src/App.js || { echo "Missing /login route in App.js"; exit 1; }
grep -q 'path="/recruit"' frontend/src/App.js || { echo "Missing /recruit route in App.js"; exit 1; }
grep -q 'path="/pda/profile"' frontend/src/App.js || { echo "Missing /pda/profile route in App.js"; exit 1; }

echo "PDA Home smoke checks passed."
