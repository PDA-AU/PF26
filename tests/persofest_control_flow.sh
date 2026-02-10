#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8001}"
API="${BASE_URL%/}/api"

PARTICIPANT_REGNO="${PARTICIPANT_REGNO:-2026000001}"
PARTICIPANT_PASSWORD="${PARTICIPANT_PASSWORD:-participant123}"
PDA_ADMIN_REGNO="${PDA_ADMIN_REGNO:-1111111111}"
PDA_ADMIN_PASSWORD="${PDA_ADMIN_PASSWORD:-admin123}"
EVENT_SLUG="${EVENT_SLUG:-persofest-2026}"

json_field() {
  python3 -c "import json,sys; print(json.load(sys.stdin)$1)"
}

echo "[1/10] Unified user login + Persofest me endpoints"
PARTICIPANT_TOKEN="$(
  curl -fsS -X POST "$API/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"regno\":\"$PARTICIPANT_REGNO\",\"password\":\"$PARTICIPANT_PASSWORD\"}" \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["access_token"])'
)"
curl -fsS "$API/me" -H "Authorization: Bearer $PARTICIPANT_TOKEN" >/dev/null
curl -fsS "$API/pda/events/$EVENT_SLUG/me" -H "Authorization: Bearer $PARTICIPANT_TOKEN" >/dev/null
curl -fsS "$API/pda/events/$EVENT_SLUG/my-rounds" -H "Authorization: Bearer $PARTICIPANT_TOKEN" >/dev/null

echo "[2/10] PF admin login"
PDA_TOKEN="$(
  curl -fsS -X POST "$API/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"regno\":\"$PDA_ADMIN_REGNO\",\"password\":\"$PDA_ADMIN_PASSWORD\"}" \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["access_token"])'
)"

echo "[3/10] Admin dashboard + participants + leaderboard"
curl -fsS "$API/pda-admin/events/$EVENT_SLUG/dashboard" -H "Authorization: Bearer $PDA_TOKEN" >/dev/null
curl -fsS "$API/pda-admin/events/$EVENT_SLUG/participants" -H "Authorization: Bearer $PDA_TOKEN" >/dev/null
curl -fsS "$API/pda-admin/events/$EVENT_SLUG/leaderboard" -H "Authorization: Bearer $PDA_TOKEN" >/dev/null

echo "[4/10] Rounds list + choose target round"
ROUNDS_JSON="$(curl -fsS "$API/pda-admin/events/$EVENT_SLUG/rounds" -H "Authorization: Bearer $PDA_TOKEN")"
ROUND_ID="$(echo "$ROUNDS_JSON" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(data[1]["id"] if len(data)>1 else data[0]["id"])')"

echo "[5/10] Round participants"
curl -fsS "$API/pda-admin/events/$EVENT_SLUG/rounds/$ROUND_ID/participants" -H "Authorization: Bearer $PDA_TOKEN" >/dev/null

echo "[6/10] Save one score entry"
FIRST_PARTICIPANT_ID="$(
  curl -fsS "$API/pda-admin/events/$EVENT_SLUG/participants" -H "Authorization: Bearer $PDA_TOKEN" \
  | python3 -c 'import json,sys; row=json.load(sys.stdin)[0]; print(row.get("participant_id") or row.get("entity_id"))'
)"
curl -fsS -X POST "$API/pda-admin/events/$EVENT_SLUG/rounds/$ROUND_ID/scores" \
  -H "Authorization: Bearer $PDA_TOKEN" \
  -H "Content-Type: application/json" \
  -d "[{\"entity_type\":\"user\",\"user_id\":$FIRST_PARTICIPANT_ID,\"criteria_scores\":{\"Score\":75},\"is_present\":true}]" >/dev/null

echo "[7/10] Set elimination + freeze + unfreeze"
curl -fsS -X PUT "$API/pda-admin/events/$EVENT_SLUG/rounds/$ROUND_ID" \
  -H "Authorization: Bearer $PDA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"elimination_type":"top_k","elimination_value":20}' >/dev/null
curl -fsS -X POST "$API/pda-admin/events/$EVENT_SLUG/rounds/$ROUND_ID/freeze" -H "Authorization: Bearer $PDA_TOKEN" >/dev/null
curl -fsS -X POST "$API/pda-admin/events/$EVENT_SLUG/rounds/$ROUND_ID/unfreeze" -H "Authorization: Bearer $PDA_TOKEN" >/dev/null

echo "[8/10] Export endpoints"
curl -fsS "$API/pda-admin/events/$EVENT_SLUG/export/participants?format=csv" -H "Authorization: Bearer $PDA_TOKEN" >/dev/null
curl -fsS "$API/pda-admin/events/$EVENT_SLUG/export/leaderboard?format=csv" -H "Authorization: Bearer $PDA_TOKEN" >/dev/null
curl -fsS "$API/pda-admin/events/$EVENT_SLUG/export/round/$ROUND_ID?format=csv" -H "Authorization: Bearer $PDA_TOKEN" >/dev/null

echo "[9/10] Logs endpoint"
curl -fsS "$API/pda-admin/superadmin/logs?limit=20&offset=0" -H "Authorization: Bearer $PDA_TOKEN" >/dev/null || true

echo "[10/10] Wrong-token check (participant token on admin endpoint should fail)"
HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" "$API/pda-admin/events/$EVENT_SLUG/dashboard" -H "Authorization: Bearer $PARTICIPANT_TOKEN")"
if [[ "$HTTP_CODE" != "401" && "$HTTP_CODE" != "403" ]]; then
  echo "Expected 401/403 for participant token on admin endpoint, got $HTTP_CODE"
  exit 1
fi

echo "Persofest control-flow checks passed."
