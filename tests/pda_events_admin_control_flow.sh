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

entity_id_by_code() {
  local code="$1"
  python3 -c '
import json, sys
code = sys.argv[1]
rows = json.load(sys.stdin)
for row in rows:
    if str(row.get("regno_or_code")) == code:
        print(row.get("entity_id"))
        break
else:
    raise SystemExit(f"entity for code {code} not found")
' "$code"
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

echo "[1/12] Health and superadmin login"
curl -fsS "$API/health" >/dev/null
SUPER_TOKEN="$(login_token "$SUPERADMIN_REGNO" "$SUPERADMIN_PASSWORD")"


echo "[2/12] Ensure recruitment open"
ensure_recruitment_open "$SUPER_TOKEN"


echo "[3/12] Create/open admin-control event"
STAMP="$(date +%s)"
CREATE_JSON="$(curl -fsS -X POST "$API/pda-admin/events" -H "Authorization: Bearer $SUPER_TOKEN" -H 'Content-Type: application/json' -d "{\"title\":\"Admin Flow $STAMP\",\"description\":\"Admin control-flow test\",\"poster_url\":null,\"event_type\":\"Event\",\"format\":\"Offline\",\"template_option\":\"attendance_scoring\",\"participant_mode\":\"individual\",\"round_mode\":\"multi\",\"round_count\":2,\"team_min_size\":null,\"team_max_size\":null,\"club_id\":1}")"
EVENT_SLUG="$(echo "$CREATE_JSON" | parse_json 'data["slug"]')"
curl -fsS -X PUT "$API/pda-admin/events/$EVENT_SLUG" -H "Authorization: Bearer $SUPER_TOKEN" -H 'Content-Type: application/json' -d '{"status":"open"}' >/dev/null


echo "[4/12] Create/login users and register them"
BASE_NUM="$((STAMP % 1000000))"
USER1_REGNO="8$(printf '%09d' "$((BASE_NUM + 201))")"
USER2_REGNO="8$(printf '%09d' "$((BASE_NUM + 202))")"
USER1_TOKEN="$(ensure_user_token "$USER1_REGNO" "$DEFAULT_USER_PASSWORD" "Admin Flow User 1" "admin_flow_user1_${STAMP}@example.com")"
USER2_TOKEN="$(ensure_user_token "$USER2_REGNO" "$DEFAULT_USER_PASSWORD" "Admin Flow User 2" "admin_flow_user2_${STAMP}@example.com")"
curl -fsS -X POST "$API/pda/events/$EVENT_SLUG/register" -H "Authorization: Bearer $USER1_TOKEN" -H 'Content-Type: application/json' -d '{}' >/dev/null
curl -fsS -X POST "$API/pda/events/$EVENT_SLUG/register" -H "Authorization: Bearer $USER2_TOKEN" -H 'Content-Type: application/json' -d '{}' >/dev/null


echo "[5/12] Resolve round and participant entities"
ROUNDS_JSON="$(curl -fsS "$API/pda-admin/events/$EVENT_SLUG/rounds" -H "Authorization: Bearer $SUPER_TOKEN")"
ROUND_ID="$(echo "$ROUNDS_JSON" | parse_json 'data[0]["id"]')"
PARTICIPANTS_JSON="$(curl -fsS "$API/pda-admin/events/$EVENT_SLUG/participants?page_size=200" -H "Authorization: Bearer $SUPER_TOKEN")"
USER1_ENTITY_ID="$(echo "$PARTICIPANTS_JSON" | entity_id_by_code "$USER1_REGNO")"
USER2_ENTITY_ID="$(echo "$PARTICIPANTS_JSON" | entity_id_by_code "$USER2_REGNO")"


echo "[6/12] Mark attendance manually"
curl -fsS -X POST "$API/pda-admin/events/$EVENT_SLUG/attendance/mark" -H "Authorization: Bearer $SUPER_TOKEN" -H 'Content-Type: application/json' -d "{\"entity_type\":\"user\",\"user_id\":$USER1_ENTITY_ID,\"round_id\":$ROUND_ID,\"is_present\":true}" >/dev/null
curl -fsS -X POST "$API/pda-admin/events/$EVENT_SLUG/attendance/mark" -H "Authorization: Bearer $SUPER_TOKEN" -H 'Content-Type: application/json' -d "{\"entity_type\":\"user\",\"user_id\":$USER2_ENTITY_ID,\"round_id\":$ROUND_ID,\"is_present\":true}" >/dev/null


echo "[7/12] Mark attendance by QR scan"
QR_JSON="$(curl -fsS "$API/pda/events/$EVENT_SLUG/qr" -H "Authorization: Bearer $USER1_TOKEN")"
QR_TOKEN="$(echo "$QR_JSON" | parse_json 'data["qr_token"]')"
curl -fsS -X POST "$API/pda-admin/events/$EVENT_SLUG/attendance/scan" -H "Authorization: Bearer $SUPER_TOKEN" -H 'Content-Type: application/json' -d "{\"token\":\"$QR_TOKEN\",\"round_id\":$ROUND_ID}" >/dev/null


echo "[8/12] Save scores then freeze/unfreeze round"
SCORES_PAYLOAD="[{\"entity_type\":\"user\",\"user_id\":$USER1_ENTITY_ID,\"criteria_scores\":{\"Score\":82},\"is_present\":true},{\"entity_type\":\"user\",\"user_id\":$USER2_ENTITY_ID,\"criteria_scores\":{\"Score\":77},\"is_present\":true}]"
curl -fsS -X POST "$API/pda-admin/events/$EVENT_SLUG/rounds/$ROUND_ID/scores" -H "Authorization: Bearer $SUPER_TOKEN" -H 'Content-Type: application/json' -d "$SCORES_PAYLOAD" >/dev/null
curl -fsS -X POST "$API/pda-admin/events/$EVENT_SLUG/rounds/$ROUND_ID/freeze" -H "Authorization: Bearer $SUPER_TOKEN" >/dev/null
FREEZE_SAVE_CODE="$(curl -sS -o /tmp/pda_freeze_save_body.json -w '%{http_code}' -X POST "$API/pda-admin/events/$EVENT_SLUG/rounds/$ROUND_ID/scores" -H "Authorization: Bearer $SUPER_TOKEN" -H 'Content-Type: application/json' -d "$SCORES_PAYLOAD")"
if [[ "$FREEZE_SAVE_CODE" != "400" ]]; then
  echo "Expected score save failure after freeze, got HTTP $FREEZE_SAVE_CODE"
  exit 1
fi
curl -fsS -X POST "$API/pda-admin/events/$EVENT_SLUG/rounds/$ROUND_ID/unfreeze" -H "Authorization: Bearer $SUPER_TOKEN" >/dev/null


echo "[9/12] Leaderboard + exports"
LEADERBOARD_JSON="$(curl -fsS "$API/pda-admin/events/$EVENT_SLUG/leaderboard?page_size=200" -H "Authorization: Bearer $SUPER_TOKEN")"
LB_COUNT="$(echo "$LEADERBOARD_JSON" | parse_json 'len(data)')"
if [[ "$LB_COUNT" -lt 2 ]]; then
  echo "Expected at least 2 leaderboard rows"
  exit 1
fi
curl -fsS "$API/pda-admin/events/$EVENT_SLUG/export/participants?format=csv" -H "Authorization: Bearer $SUPER_TOKEN" >/tmp/pda_evt_participants.csv
curl -fsS "$API/pda-admin/events/$EVENT_SLUG/export/leaderboard?format=csv" -H "Authorization: Bearer $SUPER_TOKEN" >/tmp/pda_evt_leaderboard.csv
curl -fsS "$API/pda-admin/events/$EVENT_SLUG/export/round/$ROUND_ID?format=csv" -H "Authorization: Bearer $SUPER_TOKEN" >/tmp/pda_evt_round.csv
[[ -s /tmp/pda_evt_participants.csv ]] || { echo "Participants export empty"; exit 1; }
[[ -s /tmp/pda_evt_leaderboard.csv ]] || { echo "Leaderboard export empty"; exit 1; }
[[ -s /tmp/pda_evt_round.csv ]] || { echo "Round export empty"; exit 1; }


echo "[10/12] Badge assignment"
curl -fsS -X POST "$API/pda-admin/events/$EVENT_SLUG/badges" -H "Authorization: Bearer $SUPER_TOKEN" -H 'Content-Type: application/json' -d "{\"title\":\"Winner\",\"place\":\"Winner\",\"score\":82,\"user_id\":$USER1_ENTITY_ID}" >/dev/null
BADGES_JSON="$(curl -fsS "$API/pda-admin/events/$EVENT_SLUG/badges" -H "Authorization: Bearer $SUPER_TOKEN")"
BADGE_COUNT="$(echo "$BADGES_JSON" | parse_json 'len(data)')"
if [[ "$BADGE_COUNT" -lt 1 ]]; then
  echo "Expected at least one badge"
  exit 1
fi


echo "[11/12] Close event and verify certificate eligibility"
curl -fsS -X PUT "$API/pda-admin/events/$EVENT_SLUG" -H "Authorization: Bearer $SUPER_TOKEN" -H 'Content-Type: application/json' -d '{"status":"closed"}' >/dev/null
CERT_JSON="$(curl -fsS "$API/pda/me/certificates/$EVENT_SLUG" -H "Authorization: Bearer $USER1_TOKEN")"
CERT_ELIGIBLE="$(echo "$CERT_JSON" | parse_json 'data.get("eligible")')"
if [[ "$CERT_ELIGIBLE" != "True" ]]; then
  echo "Certificate should be eligible after closed event with attendance"
  echo "$CERT_JSON"
  exit 1
fi


echo "[12/12] Achievement visible to awarded user"
ACH_JSON="$(curl -fsS "$API/pda/me/achievements" -H "Authorization: Bearer $USER1_TOKEN")"
echo "$ACH_JSON" | grep -q "\"event_slug\":\"$EVENT_SLUG\"" || { echo "Achievement not found for awarded user"; exit 1; }

echo "PDA managed-event admin control-flow checks passed."
