#!/usr/bin/env bash
set -euo pipefail

API_BASE="${BACKEND_URL:-http://localhost:8000}/api"
MOCK_TITLE="MOCKPH_$(date +%s)"
MOCK_DESC="MOCKPH_phase_test #MOCKPH_tag"
COMMUNITY_PROFILE="designteam"
COMMUNITY_PASSWORD="designteam@123"
PDA_REGNO="${PDA_TEST_REGNO:-0000000000}"
PDA_PASSWORD="${PDA_TEST_PASSWORD:-admin123}"

cleanup() {
  python3 backend/scripts/cleanup_persohub_mock_data.py >/dev/null 2>&1 || true
}
trap cleanup EXIT

json_get() {
  local key="$1"
  python3 -c 'import json,sys
key=sys.argv[1]
payload=json.load(sys.stdin)
value=payload
for part in key.split("."):
    if isinstance(value, dict):
        value=value.get(part)
    else:
        value=None
        break
if value is None:
    sys.exit(1)
if isinstance(value,(dict,list)):
    print(json.dumps(value))
else:
    print(value)
' "$key"
}

phase_check() {
  local phase="$1"
  local status
  status="$(curl -fsS "${API_BASE}/persohub/phase-gate/${phase}" | json_get status)"
  if [[ "$status" != "pass" ]]; then
    echo "Phase ${phase} check failed"
    exit 1
  fi
  echo "Phase ${phase} gate: pass"
}

echo "[Phase 1] Schema gate"
phase_check 1

echo "[Phase 2] Community auth + upload gate"
COMMUNITY_LOGIN_JSON="$(curl -fsS -X POST "${API_BASE}/persohub/community/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"profile_id\":\"${COMMUNITY_PROFILE}\",\"password\":\"${COMMUNITY_PASSWORD}\"}")"
COMMUNITY_TOKEN="$(printf '%s' "$COMMUNITY_LOGIN_JSON" | json_get access_token)"
[[ -n "$COMMUNITY_TOKEN" ]]
phase_check 2

echo "[Phase 3] Core social flow gate"
POST_JSON="$(curl -fsS -X POST "${API_BASE}/persohub/community/posts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${COMMUNITY_TOKEN}" \
  -d "{\"title\":\"${MOCK_TITLE}\",\"description\":\"${MOCK_DESC}\",\"attachments\":[],\"mentions\":[]}")"
POST_SLUG="$(printf '%s' "$POST_JSON" | json_get slug_token)"
[[ -n "$POST_SLUG" ]]

PDA_LOGIN_JSON="$(curl -fsS -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"regno\":\"${PDA_REGNO}\",\"password\":\"${PDA_PASSWORD}\"}")"
PDA_TOKEN="$(printf '%s' "$PDA_LOGIN_JSON" | json_get access_token)"
[[ -n "$PDA_TOKEN" ]]

curl -fsS "${API_BASE}/persohub/feed" >/dev/null
curl -fsS "${API_BASE}/persohub/posts/${POST_SLUG}" >/dev/null
curl -fsS -X POST "${API_BASE}/persohub/posts/${POST_SLUG}/like-toggle" -H "Authorization: Bearer ${PDA_TOKEN}" >/dev/null
curl -fsS -X POST "${API_BASE}/persohub/posts/${POST_SLUG}/comments" \
  -H "Authorization: Bearer ${PDA_TOKEN}" -H "Content-Type: application/json" \
  -d '{"comment_text":"MOCKPH_comment"}' >/dev/null
curl -fsS "${API_BASE}/persohub/search/suggestions?q=mockph" >/dev/null
curl -fsS "${API_BASE}/persohub/hashtags/mockph_tag/posts" >/dev/null
phase_check 3

echo "[Phase 4] Frontend route assumptions gate"
phase_check 4

echo "[Phase 5] Hardening assumptions gate"
phase_check 5

echo "Persohub phase gate tests completed"
