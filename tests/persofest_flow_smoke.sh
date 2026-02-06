#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8001}"
API="${BASE_URL%/}/api"

echo "[1/8] Health"
curl -fsS "$API/health" >/dev/null

echo "[2/8] Registration status"
curl -fsS "$API/registration-status" >/dev/null

echo "[3/8] Public rounds (non-draft expected by API contract)"
curl -fsS "$API/rounds/public" >/dev/null

echo "[4/8] Top referrers"
curl -fsS "$API/top-referrers" >/dev/null

echo "[5/8] Routes endpoint contains current Persofest paths"
ROUTES_JSON="$(curl -fsS "$API/routes")"
echo "$ROUTES_JSON" | grep -q '/persofest/admin/rounds' || { echo "Missing /persofest/admin/rounds"; exit 1; }
echo "$ROUTES_JSON" | grep -q '/persofest/admin/export/round/{round_id}' || { echo "Missing /persofest/admin/export/round/{round_id}"; exit 1; }

echo "[6/8] Unauthorized PF admin API should fail"
HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" "$API/persofest/admin/dashboard")"
if [[ "$HTTP_CODE" != "403" && "$HTTP_CODE" != "401" ]]; then
  echo "Expected 401/403 for unauthorized PF admin API, got $HTTP_CODE"
  exit 1
fi

if [[ -n "${PARTICIPANT_REGNO:-}" && -n "${PARTICIPANT_PASSWORD:-}" ]]; then
  echo "[7/8] Participant auth flow"
  PARTICIPANT_TOKEN="$(
    curl -fsS -X POST "$API/participant-auth/login" \
      -H 'Content-Type: application/json' \
      -d "{\"register_number\":\"$PARTICIPANT_REGNO\",\"password\":\"$PARTICIPANT_PASSWORD\"}" \
    | python3 -c 'import sys, json; print(json.load(sys.stdin)["access_token"])'
  )"
  curl -fsS "$API/participant/me" -H "Authorization: Bearer $PARTICIPANT_TOKEN" >/dev/null
  curl -fsS "$API/participant/me/rounds" -H "Authorization: Bearer $PARTICIPANT_TOKEN" >/dev/null
else
  echo "[7/8] Skipped participant auth flow (set PARTICIPANT_REGNO and PARTICIPANT_PASSWORD)"
fi

if [[ -n "${PDA_ADMIN_REGNO:-}" && -n "${PDA_ADMIN_PASSWORD:-}" ]]; then
  echo "[8/8] PF admin auth flow"
  PDA_TOKEN="$(
    curl -fsS -X POST "$API/auth/login" \
      -H 'Content-Type: application/json' \
      -d "{\"regno\":\"$PDA_ADMIN_REGNO\",\"password\":\"$PDA_ADMIN_PASSWORD\"}" \
    | python3 -c 'import sys, json; print(json.load(sys.stdin)["access_token"])'
  )"
  curl -fsS "$API/persofest/admin/dashboard" -H "Authorization: Bearer $PDA_TOKEN" >/dev/null
  curl -fsS "$API/persofest/admin/rounds" -H "Authorization: Bearer $PDA_TOKEN" >/dev/null
  curl -fsS "$API/persofest/admin/participants" -H "Authorization: Bearer $PDA_TOKEN" >/dev/null
  curl -fsS "$API/persofest/admin/leaderboard" -H "Authorization: Bearer $PDA_TOKEN" >/dev/null
else
  echo "[8/8] Skipped PF admin auth flow (set PDA_ADMIN_REGNO and PDA_ADMIN_PASSWORD)"
fi

echo "Persofest flow smoke checks passed."
