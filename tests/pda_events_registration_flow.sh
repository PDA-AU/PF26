#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8001}"
API="${BASE_URL%/}/api"
SUPERADMIN_REGNO="${SUPERADMIN_REGNO:-0000000000}"
SUPERADMIN_PASSWORD="${SUPERADMIN_PASSWORD:-admin123}"
DEFAULT_USER_PASSWORD="${DEFAULT_USER_PASSWORD:-pdaevent123}"

parse_json() {
  local expr="$1"
  python3 -c "import json,sys; data=json.load(sys.stdin); print($expr)"
}

post_json() {
  local url="$1"
  local body="$2"
  local auth_header="${3:-}"
  if [[ -n "$auth_header" ]]; then
    curl -sS -X POST "$url" -H 'Content-Type: application/json' -H "$auth_header" -d "$body"
  else
    curl -sS -X POST "$url" -H 'Content-Type: application/json' -d "$body"
  fi
}

login_token() {
  local regno="$1"
  local password="$2"
  local response
  response="$(curl -sS -o /tmp/pda_login_body.json -w '%{http_code}' -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"regno\":\"$regno\",\"password\":\"$password\"}")"
  if [[ "$response" != "200" ]]; then
    return 1
  fi
  cat /tmp/pda_login_body.json | parse_json 'data["access_token"]'
}

ensure_user_token() {
  local regno="$1"
  local password="$2"
  local name="$3"
  local email="$4"
  local token

  if token="$(login_token "$regno" "$password" 2>/dev/null)"; then
    echo "$token"
    return 0
  fi

  local register_code
  register_code="$(curl -sS -o /tmp/pda_register_body.json -w '%{http_code}' -X POST "$API/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$name\",\"regno\":\"$regno\",\"email\":\"$email\",\"dob\":\"2004-01-01\",\"gender\":\"Male\",\"phno\":\"9876543210\",\"dept\":\"Information Technology\",\"password\":\"$password\",\"preferred_team\":\"Design\"}")"

  if [[ "$register_code" != "200" && "$register_code" != "202" ]]; then
    echo "User registration failed for $regno"
    cat /tmp/pda_register_body.json
    exit 1
  fi

  if ! token="$(login_token "$regno" "$password" 2>/dev/null)"; then
    echo "Unable to login user $regno after registration (email verification may be required)."
    cat /tmp/pda_register_body.json
    exit 1
  fi

  echo "$token"
}

ensure_recruitment_open() {
  local super_token="$1"
  local status_json
  status_json="$(curl -fsS "$API/pda-admin/superadmin/recruitment-status" -H "Authorization: Bearer $super_token")"
  local is_open
  is_open="$(echo "$status_json" | parse_json 'str(data.get("recruitment_open", False)).lower()')"
  if [[ "$is_open" != "true" ]]; then
    curl -fsS -X POST "$API/pda-admin/superadmin/recruitment-toggle" -H "Authorization: Bearer $super_token" >/dev/null
  fi
}

echo "[1/10] Health and superadmin login"
curl -fsS "$API/health" >/dev/null
SUPER_TOKEN="$(login_token "$SUPERADMIN_REGNO" "$SUPERADMIN_PASSWORD")"


echo "[2/10] Ensure recruitment open for test user creation"
ensure_recruitment_open "$SUPER_TOKEN"


echo "[3/10] Create and open individual + team managed events"
STAMP="$(date +%s)"
IND_CREATE="$(curl -fsS -X POST "$API/pda-admin/events" -H "Authorization: Bearer $SUPER_TOKEN" -H 'Content-Type: application/json' -d "{\"title\":\"Reg Flow Individual $STAMP\",\"description\":\"Registration flow individual\",\"poster_url\":null,\"event_type\":\"Workshop\",\"format\":\"Offline\",\"template_option\":\"attendance_scoring\",\"participant_mode\":\"individual\",\"round_mode\":\"single\",\"round_count\":1,\"team_min_size\":null,\"team_max_size\":null,\"club_id\":1}")"
TEAM_CREATE="$(curl -fsS -X POST "$API/pda-admin/events" -H "Authorization: Bearer $SUPER_TOKEN" -H 'Content-Type: application/json' -d "{\"title\":\"Reg Flow Team $STAMP\",\"description\":\"Registration flow team\",\"poster_url\":null,\"event_type\":\"Event\",\"format\":\"Offline\",\"template_option\":\"attendance_scoring\",\"participant_mode\":\"team\",\"round_mode\":\"multi\",\"round_count\":2,\"team_min_size\":1,\"team_max_size\":4,\"club_id\":1}")"
IND_SLUG="$(echo "$IND_CREATE" | parse_json 'data["slug"]')"
TEAM_SLUG="$(echo "$TEAM_CREATE" | parse_json 'data["slug"]')"
curl -fsS -X PUT "$API/pda-admin/events/$IND_SLUG" -H "Authorization: Bearer $SUPER_TOKEN" -H 'Content-Type: application/json' -d '{"status":"open"}' >/dev/null
curl -fsS -X PUT "$API/pda-admin/events/$TEAM_SLUG" -H "Authorization: Bearer $SUPER_TOKEN" -H 'Content-Type: application/json' -d '{"status":"open"}' >/dev/null


echo "[4/10] Create/login test users"
BASE_NUM="$((STAMP % 1000000))"
USER1_REGNO="7$(printf '%09d' "$((BASE_NUM + 101))")"
USER2_REGNO="7$(printf '%09d' "$((BASE_NUM + 102))")"
USER3_REGNO="7$(printf '%09d' "$((BASE_NUM + 103))")"
USER1_TOKEN="$(ensure_user_token "$USER1_REGNO" "$DEFAULT_USER_PASSWORD" "Event User One" "event_user1_${STAMP}@example.com")"
USER2_TOKEN="$(ensure_user_token "$USER2_REGNO" "$DEFAULT_USER_PASSWORD" "Event User Two" "event_user2_${STAMP}@example.com")"
USER3_TOKEN="$(ensure_user_token "$USER3_REGNO" "$DEFAULT_USER_PASSWORD" "Event User Three" "event_user3_${STAMP}@example.com")"


echo "[5/10] Individual registration path"
curl -fsS -X POST "$API/pda/events/$IND_SLUG/register" -H "Authorization: Bearer $USER1_TOKEN" -H 'Content-Type: application/json' -d '{}' >/dev/null
IND_DASH="$(curl -fsS "$API/pda/events/$IND_SLUG/dashboard" -H "Authorization: Bearer $USER1_TOKEN")"
IND_REGISTERED="$(echo "$IND_DASH" | parse_json 'data.get("is_registered")')"
IND_ENTITY="$(echo "$IND_DASH" | parse_json 'data.get("entity_type")')"
if [[ "$IND_REGISTERED" != "True" || "$IND_ENTITY" != "user" ]]; then
  echo "Individual registration dashboard mismatch"
  echo "$IND_DASH"
  exit 1
fi


echo "[6/10] Team create + join by code"
TEAM_CREATED="$(curl -fsS -X POST "$API/pda/events/$TEAM_SLUG/teams/create" -H "Authorization: Bearer $USER1_TOKEN" -H 'Content-Type: application/json' -d '{"team_name":"Flow Squad"}')"
TEAM_CODE="$(echo "$TEAM_CREATED" | parse_json 'data["team_code"]')"
curl -fsS -X POST "$API/pda/events/$TEAM_SLUG/teams/join" -H "Authorization: Bearer $USER2_TOKEN" -H 'Content-Type: application/json' -d "{\"team_code\":\"$TEAM_CODE\"}" >/dev/null


echo "[7/10] Leader invite by regno"
curl -fsS -X POST "$API/pda/events/$TEAM_SLUG/team/invite" -H "Authorization: Bearer $USER1_TOKEN" -H 'Content-Type: application/json' -d "{\"regno\":\"$USER3_REGNO\"}" >/dev/null
USER3_TEAM="$(curl -fsS "$API/pda/events/$TEAM_SLUG/team" -H "Authorization: Bearer $USER3_TOKEN")"
USER3_TEAM_CODE="$(echo "$USER3_TEAM" | parse_json 'data["team_code"]')"
if [[ "$USER3_TEAM_CODE" != "$TEAM_CODE" ]]; then
  echo "Invite flow failed: user3 not in expected team"
  exit 1
fi


echo "[8/10] Team dashboard entity status"
TEAM_DASH="$(curl -fsS "$API/pda/events/$TEAM_SLUG/dashboard" -H "Authorization: Bearer $USER1_TOKEN")"
TEAM_REGISTERED="$(echo "$TEAM_DASH" | parse_json 'data.get("is_registered")')"
TEAM_ENTITY="$(echo "$TEAM_DASH" | parse_json 'data.get("entity_type")')"
if [[ "$TEAM_REGISTERED" != "True" || "$TEAM_ENTITY" != "team" ]]; then
  echo "Team dashboard mismatch"
  echo "$TEAM_DASH"
  exit 1
fi


echo "[9/10] QR generation for individual and team"
IND_QR="$(curl -fsS "$API/pda/events/$IND_SLUG/qr" -H "Authorization: Bearer $USER1_TOKEN")"
TEAM_QR="$(curl -fsS "$API/pda/events/$TEAM_SLUG/qr" -H "Authorization: Bearer $USER2_TOKEN")"
IND_QR_ENTITY="$(echo "$IND_QR" | parse_json 'data["entity_type"]')"
TEAM_QR_ENTITY="$(echo "$TEAM_QR" | parse_json 'data["entity_type"]')"
if [[ "$IND_QR_ENTITY" != "user" || "$TEAM_QR_ENTITY" != "team" ]]; then
  echo "QR entity mismatch"
  exit 1
fi


echo "[10/10] My events endpoint reflects registrations"
MY_EVENTS="$(curl -fsS "$API/pda/me/events" -H "Authorization: Bearer $USER1_TOKEN")"
echo "$MY_EVENTS" | grep -q "\"slug\":\"$IND_SLUG\"" || { echo "Individual event missing in my events"; exit 1; }
echo "$MY_EVENTS" | grep -q "\"slug\":\"$TEAM_SLUG\"" || { echo "Team event missing in my events"; exit 1; }

echo "PDA managed-event registration flow checks passed."
