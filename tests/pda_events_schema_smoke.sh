#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8001}"
API="${BASE_URL%/}/api"
SUPERADMIN_REGNO="${SUPERADMIN_REGNO:-0000000000}"
SUPERADMIN_PASSWORD="${SUPERADMIN_PASSWORD:-admin123}"

parse_json() {
  local expr="$1"
  python3 -c "import json,sys; data=json.load(sys.stdin); print($expr)"
}

echo "[1/8] Health + route contract"
curl -fsS "$API/health" >/dev/null
ROUTES_JSON="$(curl -fsS "$API/routes")"
echo "$ROUTES_JSON" | grep -q '"/pda-admin/events"' || { echo "Missing /pda-admin/events"; exit 1; }
echo "$ROUTES_JSON" | grep -q '"/pda/events/ongoing"' || { echo "Missing /pda/events/ongoing"; exit 1; }
echo "$ROUTES_JSON" | grep -q '"/pda/me/events"' || { echo "Missing /pda/me/events"; exit 1; }

echo "[2/8] DB table existence sanity"
python3 - <<'PY'
import os
from sqlalchemy import create_engine, inspect
from dotenv import load_dotenv

load_dotenv('backend/.env')
db_url = os.environ.get('DATABASE_URL')
if not db_url:
    raise SystemExit('DATABASE_URL missing in backend/.env')
engine = create_engine(db_url, pool_pre_ping=True)
inspector = inspect(engine)
required = {
    'pda_events',
    'pda_event_registrations',
    'pda_event_teams',
    'pda_event_team_members',
    'pda_event_rounds',
    'pda_event_attendance',
    'pda_event_scores',
    'pda_event_badges',
    'pda_event_invites',
}
existing = set(inspector.get_table_names())
missing = sorted(required - existing)
if missing:
    raise SystemExit(f'Missing managed-event tables: {missing}')
print('Managed-event tables present:', len(required))
PY

echo "[3/8] Superadmin login"
SUPER_TOKEN="$(
  curl -fsS -X POST "$API/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"regno\":\"$SUPERADMIN_REGNO\",\"password\":\"$SUPERADMIN_PASSWORD\"}" \
  | parse_json 'data["access_token"]'
)"

echo "[4/8] Managed event create (CRUD create)"
STAMP="$(date +%s)"
TITLE="Schema Smoke ${STAMP}"
CREATE_JSON="$(
  curl -fsS -X POST "$API/pda-admin/events" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"title\":\"$TITLE\",\"description\":\"Schema smoke event\",\"poster_url\":null,\"event_type\":\"Event\",\"format\":\"Offline\",\"template_option\":\"attendance_scoring\",\"participant_mode\":\"individual\",\"round_mode\":\"single\",\"round_count\":1,\"team_min_size\":null,\"team_max_size\":null,\"club_id\":1}" \
)"
EVENT_SLUG="$(echo "$CREATE_JSON" | parse_json 'data["slug"]')"
EVENT_STATUS="$(echo "$CREATE_JSON" | parse_json 'data["status"]')"
if [[ "$EVENT_STATUS" != "closed" ]]; then
  echo "Expected new event status closed, got $EVENT_STATUS"
  exit 1
fi

echo "[5/8] Managed event list + rounds created"
EVENT_LIST="$(curl -fsS "$API/pda-admin/events" -H "Authorization: Bearer $SUPER_TOKEN")"
echo "$EVENT_LIST" | grep -q "\"slug\":\"$EVENT_SLUG\"" || { echo "Created event not listed"; exit 1; }
ROUNDS_JSON="$(curl -fsS "$API/pda-admin/events/$EVENT_SLUG/rounds" -H "Authorization: Bearer $SUPER_TOKEN")"
ROUNDS_COUNT="$(echo "$ROUNDS_JSON" | parse_json 'len(data)')"
if [[ "$ROUNDS_COUNT" -lt 1 ]]; then
  echo "Expected at least 1 auto-provisioned round"
  exit 1
fi

echo "[6/8] Managed event update status to open"
curl -fsS -X PUT "$API/pda-admin/events/$EVENT_SLUG" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"open"}' >/dev/null

echo "[7/8] Ongoing events includes opened event"
ONGOING="$(curl -fsS "$API/pda/events/ongoing")"
echo "$ONGOING" | grep -q "\"slug\":\"$EVENT_SLUG\"" || { echo "Opened event not visible in ongoing list"; exit 1; }

echo "[8/8] Dashboard endpoint sanity"
curl -fsS "$API/pda-admin/events/$EVENT_SLUG/dashboard" -H "Authorization: Bearer $SUPER_TOKEN" >/dev/null

echo "PDA managed-event schema smoke checks passed."
