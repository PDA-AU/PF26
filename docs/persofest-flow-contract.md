# Persofest Flow Contract

## Frontend Routes

1. `/persofest`
- Public landing page.
- No auth required.

2. `/persofest/login`
- Participant login page.
- If participant session exists, redirect to `/persofest/dashboard`.

3. `/persofest/register`
- Participant registration page.
- If participant session exists, redirect to `/persofest/dashboard`.

4. `/persofest/dashboard`
- Participant-only page.
- Requires participant token (`ParticipantAuthContext`).
- Unauthorized redirect: `/persofest/login`.

5. `/persofest/admin`
- Persofest admin entry page.
- Uses PDA auth (`AuthContext`) and PF policy.
- If PDA user is missing or `policy.pf` is false, render admin login page.
- If PDA user is PF-authorized, render admin dashboard.

6. `/persofest/admin/rounds`
7. `/persofest/admin/participants`
8. `/persofest/admin/scoring/:roundId`
9. `/persofest/admin/leaderboard`
10. `/persofest/admin/logs`
- PDA PF-admin-only pages.
- Requires PDA token with `policy.pf=true` or superadmin.
- Unauthorized redirect: `/persofest/admin`.

## Token Ownership

1. Participant routes must use participant token only.
2. Persofest admin routes must use PDA token only.
3. Participant token must not grant access to `/api/persofest/admin/*`.
4. PDA token without PF policy must not grant access to `/api/persofest/admin/*`.

## Backend Endpoint Contract

1. Participant auth endpoints:
- `POST /api/participant-auth/register`
- `POST /api/participant-auth/login`
- `POST /api/participant-auth/refresh`
- `GET /api/participant/me`
- `PUT /api/participant/me`
- `POST /api/participant/me/profile-picture`
- `GET /api/participant/me/rounds`

2. Persofest admin endpoints:
- All `/api/persofest/admin/*` endpoints must require PF admin policy.

3. Public Persofest endpoints:
- `GET /api/registration-status`
- `GET /api/rounds/public` (must exclude draft rounds)
- `GET /api/top-referrers`

## Redirect Rules

1. Participant dashboard unauthorized -> `/persofest/login`.
2. PF admin subroutes unauthorized -> `/persofest/admin`.
3. Participant public auth pages with active participant session -> `/persofest/dashboard`.

