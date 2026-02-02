# Persofest'26 - Product Requirements Document

## Original Problem Statement
Build a production-ready, full-stack event management website for Persofest'26, an inter-department personality development competition conducted by the Personality Development Association – Web Team, Maras Institute of Technology, Chennai.

## Architecture
- **Frontend**: React with Neo-brutalism UI (Tailwind CSS)
- **Backend**: FastAPI with SQLAlchemy ORM
- **Database**: PostgreSQL (external)
- **Authentication**: JWT (access + refresh tokens)

## User Personas
1. **Participant**: College students registering for the competition
2. **Admin**: Event organizers managing rounds and evaluation

## Core Requirements (Static)
- JWT authentication with register number + password
- Participant registration with referral system
- Admin dashboard for round management
- 10 elimination rounds with scoring
- Leaderboard (admin only)
- Export functionality (CSV/XLSX)

## What's Been Implemented (Feb 2, 2026)

### Backend
- ✅ User authentication (register, login, refresh token)
- ✅ Participant management (profile, profile picture upload)
- ✅ Round CRUD operations (create, update, delete, state management)
- ✅ Score entry and evaluation system
- ✅ **Bulk score import from Excel** (with template download)
- ✅ Elimination logic (top K or minimum score)
- ✅ Leaderboard calculation
- ✅ Export endpoints (participants, rounds, leaderboard)
- ✅ Registration pause/resume toggle
- ✅ Dashboard statistics

### Frontend
- ✅ Landing page with event info, rounds, top referrers
- ✅ Login page (register number + password)
- ✅ Registration page with all fields
- ✅ Participant dashboard (profile, referral code, round status)
- ✅ Admin dashboard (stats, charts, quick actions)
- ✅ Admin rounds management
- ✅ Admin participants management with filters
- ✅ Admin scoring page with **bulk Excel import**
- ✅ Admin leaderboard with export

### Scripts
- ✅ setup.sh - Installs dependencies, creates venv, initializes database
- ✅ start.sh - Starts both backend and frontend servers

### Design
- ✅ Neo-brutalism UI with purple primary color
- ✅ Thick black borders, card-based layouts
- ✅ Mobile-first responsive design
- ✅ Lexend + DM Sans fonts

## Prioritized Backlog

### P0 (Critical - Done)
- [x] Authentication system
- [x] User registration with referral
- [x] Admin dashboard
- [x] Round management
- [x] Score entry

### P1 (High Priority)
- [ ] Email notifications on registration
- [ ] Round-wise detailed scoring criteria editor
- [ ] Bulk score import from Excel
- [ ] Advanced analytics charts

### P2 (Medium Priority)
- [ ] Password reset functionality
- [ ] Profile picture cropping
- [ ] Round scheduling reminders
- [ ] Public leaderboard option

## Next Tasks
1. Add more detailed evaluation criteria editor
2. Implement email notifications
3. Add advanced filtering in leaderboard
4. Create participant certificates generation
