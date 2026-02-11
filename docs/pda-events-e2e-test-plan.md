# PDA Events E2E Test Plan

## Goal
Validate the PDA managed-event system end-to-end for individual and team events, without regressions in existing PDA content flows.

## Environment
- Backend running at `BASE_URL` (default: `http://127.0.0.1:8001`)
- `DATABASE_URL` set in `backend/.env`
- Superadmin credentials available (defaults used by scripts):
  - regno: `0000000000`
  - password: `admin123`

## Seed
- Run:
```bash
python3 backend/scripts/seed_pda_events_mock.py
```

## Execution Matrix

### 1) Schema + API contract
- Script: `tests/pda_events_schema_smoke.sh`
- Verifies:
  - managed-event tables exist
  - route contract includes managed-event endpoints
  - superadmin can create/open managed event
  - auto-provisioned rounds exist

### 2) Registration journeys
- Script: `tests/pda_events_registration_flow.sh`
- Verifies:
  - individual registration flow
  - team create/join/invite flow
  - QR token generation (user/team)
  - user `my-events` aggregation

### 3) Admin operations
- Script: `tests/pda_events_admin_control_flow.sh`
- Verifies:
  - attendance mark + QR scan mark
  - score save, freeze/unfreeze guard behavior
  - leaderboard + exports
  - badge assignment
  - certificate eligibility after close + attendance

### 4) Regression guardrails
- Script: `tests/pda_home_smoke.sh`

## Recommended command sequence
```bash
tests/pda_events_schema_smoke.sh
tests/pda_events_registration_flow.sh
tests/pda_events_admin_control_flow.sh
tests/pda_home_smoke.sh
```

## Success Criteria
- All scripts exit `0`.
- Managed-event flows work for both entity modes (`user`, `team`).
- Existing PDA home/admin flows continue to pass smoke checks.
