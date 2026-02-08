# PDA Managed Events Flow Contract

## Scope
- This flow is isolated from Persofest.
- Persofest tables, APIs, and UI remain untouched.
- Managed events are served through:
  - User routes: `/events/:eventSlug`
  - Admin routes: `/admin/events` and `/admin/events/:eventSlug`

## Data Contracts

### Core tables
- `pda_events`
- `pda_event_registrations`
- `pda_event_teams`
- `pda_event_team_members`
- `pda_event_rounds`
- `pda_event_attendance`
- `pda_event_scores`
- `pda_event_badges`
- `pda_event_invites`

### Enum conventions
- `event_type`: `Session | Workshop | Event`
- `format`: `Online | Offline | Hybrid`
- `template_option`: `attendance_only | attendance_scoring`
- `participant_mode`: `individual | team`
- `round_mode`: `single | multi`
- `status`: `open | closed`
- `entity_type`: `user | team`

## API Surface

### User APIs (`/api/pda/events/*`)
- `GET /api/pda/events/ongoing`
- `GET /api/pda/events/{slug}`
- `GET /api/pda/events/{slug}/dashboard`
- `POST /api/pda/events/{slug}/register`
- `POST /api/pda/events/{slug}/teams/create`
- `POST /api/pda/events/{slug}/teams/join`
- `GET /api/pda/events/{slug}/team`
- `POST /api/pda/events/{slug}/team/invite`
- `GET /api/pda/events/{slug}/qr`
- `GET /api/pda/me/events`
- `GET /api/pda/me/achievements`
- `GET /api/pda/me/certificates/{event_slug}`

### Admin APIs (`/api/pda-admin/events/*`)
- `GET /api/pda-admin/events`
- `POST /api/pda-admin/events`
- `PUT /api/pda-admin/events/{slug}`
- `GET /api/pda-admin/events/{slug}/dashboard`
- `GET /api/pda-admin/events/{slug}/participants`
- `GET /api/pda-admin/events/{slug}/attendance`
- `POST /api/pda-admin/events/{slug}/attendance/mark`
- `POST /api/pda-admin/events/{slug}/attendance/scan`
- `GET /api/pda-admin/events/{slug}/rounds`
- `POST /api/pda-admin/events/{slug}/rounds`
- `PUT /api/pda-admin/events/{slug}/rounds/{round_id}`
- `GET /api/pda-admin/events/{slug}/rounds/{round_id}/participants`
- `POST /api/pda-admin/events/{slug}/rounds/{round_id}/scores`
- `POST /api/pda-admin/events/{slug}/rounds/{round_id}/import-scores`
- `GET /api/pda-admin/events/{slug}/rounds/{round_id}/score-template`
- `POST /api/pda-admin/events/{slug}/rounds/{round_id}/freeze`
- `POST /api/pda-admin/events/{slug}/rounds/{round_id}/unfreeze`
- `GET /api/pda-admin/events/{slug}/leaderboard`
- `GET /api/pda-admin/events/{slug}/export/participants`
- `GET /api/pda-admin/events/{slug}/export/leaderboard`
- `GET /api/pda-admin/events/{slug}/export/round/{round_id}`
- `POST /api/pda-admin/events/{slug}/badges`
- `GET /api/pda-admin/events/{slug}/badges`

## Policy Contract
- Superadmin policy payload supports dynamic event access map:
```json
{
  "home": true,
  "pf": true,
  "superAdmin": false,
  "events": {
    "event-slug": true
  }
}
```
- Access guard for admin event routes uses `policy.events[slug]`.

## UI Contract

### PDA Home (`/`)
- Existing content sections remain.
- New **Ongoing Events** section renders managed open events.
- Logged-in users can register directly:
  - Individual: confirm register.
  - Team: create team or join by code.

### User Event Dashboard (`/events/:eventSlug`)
- Requires PDA login.
- Only open events are accessible.
- Shows:
  - event metadata
  - registration status
  - entity details (team code/members for team events)
  - leader invite by regno
  - QR token for attendance scan

### Admin Event Pages (`/admin/events*`)
- `/admin/events`: create/list/manage managed events
- `/admin/events/:eventSlug`: tabs for dashboard, attendance, rounds, participants, leaderboard

### Profile (`/profile`)
- Full-page profile with:
  - My Events
  - Achievements
  - Share action
  - Certificate download action (eligible when event is closed + attended)

## Team Event Rules
- Team is the scoring and attendance entity.
- All members share team attendance and scores.
- QR generation for team events returns team entity token.

## Mock Data
- Seeder: `backend/scripts/seed_pda_events_mock.py`
- Creates sample users, managed events, rounds, registrations, attendance, scores, and badges.

## End-to-End Test Plan

### Pre-check
1. Start backend server.
2. Ensure `DATABASE_URL` is configured in `backend/.env`.

### Automated smoke scripts
1. `tests/pda_events_schema_smoke.sh`
- validates schema existence + event create/open/dashboard
2. `tests/pda_events_registration_flow.sh`
- validates individual/team registration + join/invite + QR + my-events
3. `tests/pda_events_admin_control_flow.sh`
- validates attendance, scoring, freeze/unfreeze, exports, badges, certificate eligibility

### Existing regression checks
1. `tests/persofest_control_flow.sh`
2. `tests/pda_home_smoke.sh`

### Recommended run order
1. `python3 backend/scripts/seed_pda_events_mock.py`
2. `tests/pda_events_schema_smoke.sh`
3. `tests/pda_events_registration_flow.sh`
4. `tests/pda_events_admin_control_flow.sh`
5. `tests/persofest_control_flow.sh`
6. `tests/pda_home_smoke.sh`
