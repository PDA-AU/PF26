# Persohub Results Trends Plan

## Summary
- Build the results system in three delivery slices instead of one broad implementation pass.
- Make the backend snapshot and publish model the foundation before extending the public infographic UI.
- Keep public results visually rich and infographic-led, while admin stays operational and table-first.
- Use one shared deterministic analysis engine for both `individual` and `team` events.

## Delivery Plan

### Slice 1: Backend publish foundation
- Add round-level publish state and snapshot storage on `persohub_event_rounds`.
- Add final event snapshot storage on `persohub_events`.
- Extract reusable ranking and cumulative-score logic from `backend/routers/persohub_events_admin.py` into a shared analysis service.
- Add publish APIs for round results and final event results.
- Keep existing event hero fields and event-level publish behavior intact during migration.

### Slice 2: Admin control and public round timeline
- Extend admin results page with a completed-round publish table.
- Extend the public results page from hero-only into:
  - a round timeline
  - locked and unlocked round cards
  - infographic metric cards
  - round-level charts driven by stored snapshots
- Do not recompute rankings or analytics in React.

### Slice 3: Final event insights and participant summaries
- Add final event infographic sections:
  - KPI strip
  - winner and podium
  - leaderboard visuals
  - score and rank progression charts
  - deterministic highlight cards
- Add participant-facing published results and a wrapped-style summary.
- Reuse chart primitives from the public results page, but keep participant visuals lighter in v1.

## Data Model

### Source of truth
- Existing Persohub score, attendance, registration, wildcard, and elimination logic.
- Existing Persohub tables:
  - `persohub_events`
  - `persohub_event_rounds`
  - `persohub_event_registrations`
  - `persohub_event_teams`
  - `persohub_event_team_members`
  - `persohub_event_attendance`
  - `persohub_event_scores`

### Required schema additions
- `persohub_event_rounds`
  - `results_published` boolean, default `false`
  - `results_published_at` timestamp, nullable
  - `results_snapshot` JSON, nullable
- `persohub_events`
  - keep existing `results_published`
  - keep existing `results_caption`
  - keep existing `results_model_url`
  - add `event_results_snapshot` JSON, nullable

### Snapshot rules
- Public reads always use stored snapshots.
- Publishing round `N` computes cumulative state only through round `N`.
- Round `N` snapshot must not include score or rank effects from round `N+1` or later.
- Final event publish computes from all currently published rounds.
- Score or attendance edits after publish require republish to affect public output.
- Unpublish hides the snapshot from public surfaces and may either null the snapshot or retain it internally, but public behavior must be identical.

## Analysis Engine

### Service design
- Add a shared backend service, for example `backend/persohub_result_analysis.py`.
- Inputs:
  - event
  - ordered rounds up to a boundary round
  - registrations
  - scores
  - attendance
  - wildcard state
  - elimination state
- Outputs:
  - `round_result`
  - `participant_result`
  - `event_result`

### Entity abstraction
- Use one entity model for both participant modes:
  - `entity_type`: `user | team`
  - `entity_id`
  - display name
  - register number or team code
  - leader or owner metadata where applicable
- The engine must support both `individual` and `team` events without separate payload families.

### `round_result`
- Generated for each published round card.
- Includes:
  - total
  - present
  - absent
  - eliminated
  - advanced
  - elimination rate
  - average
  - maximum
  - minimum
  - median
  - standard deviation
  - range
  - top scorer
  - criteria tags
  - chart-ready payloads

### `participant_result`
- Generated cumulatively up to the publish boundary.
- Includes per entity:
  - round score
  - round rank
  - cumulative score
  - cumulative rank
  - rounds participated
  - attendance count
  - current status
  - wildcard metadata where applicable
- Includes participant trend cards:
  - best round
  - worst round
  - largest improvement
  - largest drop
  - average round score
  - final rank
  - average rank
  - best rank
  - worst rank
  - consistency score
  - rounds survived
  - biggest comeback round
  - biggest collapse round
  - performance trend
  - eliminated round

### `event_result`
- Generated only for final event publish.
- Includes:
  - final leaderboard
  - winner and podium
  - score progression
  - rank movement
  - funnel metrics
  - event highlights
  - event summary

### Deterministic highlight catalog
- Most consistent entity
- Biggest comeback
- Highest single-round score
- Wire-to-wire leader
- Round dominator
- Closest finish
- Most improved
- Most volatile
- Fastest climb
- Biggest drop
- Steepest elimination round
- Survival milestone
- Unique round winners
- Perfect attendance
- Optional demographic insights only when event metadata supports them

## API Contract

### Admin APIs
- `GET /api/persohub/admin/persohub-events/{slug}/results/rounds`
  - Returns publish eligibility, publish state, snapshot summary, and publish timestamps for all rounds.
- `PUT /api/persohub/admin/persohub-events/{slug}/results/rounds/{round_id}`
  - Publishes, unpublishes, or republishes a round snapshot.
- `PUT /api/persohub/admin/persohub-events/{slug}/results/final`
  - Publishes or unpublishes the final event snapshot.

### Public APIs
- Extend `GET /api/persohub/persohub-events/{slug}/results`
  - Returns hero data, timeline state, unlocked round snapshots, and final event snapshot when published.
- Add an authenticated participant results endpoint
  - Returns only the caller's published standings and wrapped-style summary
  - Must not expose private summaries for other participants

### Response models
- `RoundResultSnapshot`
- `ParticipantRoundStanding`
- `ParticipantWrappedSummary`
- `EventSummarySnapshot`
- `EventHighlight`
- `ScoreProgressionSeries`
- `RankMovementSeries`

### Payload design rule
- Snapshot payloads must be frontend-ready.
- React components may format and render, but must not recreate ranking or analytics logic.
- Include presentation hints only where they safely reduce duplication:
  - `palette_key`
  - `tone`
  - `highlight_level`
  - `default_graph`

## UI Contract

### Public results page
- Keep the current dark trophy-hero aesthetic as the base.
- Add a scrollable infographic section below the hero.
- New public sections:
  - results timeline
  - infographic round cards
  - final event insights
- Use a bold festival palette with strong contrast on dark surfaces.
- Use Recharts for chart rendering.

### Results timeline
- Connected horizontal timeline line.
- Carousel-style round cards.
- Locked cards:
  - muted treatment
  - lock icon
  - no hidden metrics rendered
- Published cards:
  - saturated edge treatment
  - active chart area
  - animated first reveal

### Infographic round cards
- Participation block
- Score analytics block
- Top scorer chip
- Segmented graph switcher:
  - `Distribution`
  - `Attendance`
  - `Elimination`
- Use large numeric emphasis, icon-led labels, short supporting text, and color-coded accents by metric category.

### Final event insights
- KPI strip
- Winner or podium spotlight
- Leaderboard visualization
- Score progression chart
- Rank movement chart
- Deterministic highlight cards

### Participant-facing summaries
- Reuse the same snapshot model.
- Visual treatment can be lighter than the public event page in v1.
- Reuse chart primitives where possible instead of building a separate chart system.

### Admin results page
- Keep admin results practical and publish-control focused.
- Add a completed-round publish table with:
  - round number
  - round name
  - round state
  - score row count
  - present count
  - publish state
  - published at
  - actions
- Actions:
  - publish
  - unpublish
  - republish
- Final event publish control remains separate and gated by round-publish prerequisites.
- A compact preview panel is acceptable; a highly animated infographic admin surface is out of scope.

## Motion and Loading
- Add staged loading behavior for the public results page:
  - skeleton infographic cards
  - animated chart placeholders
  - timeline shimmer or sweep for reveal
- Use smooth but restrained transitions:
  - 180ms to 320ms duration
  - cubic-bezier easing compatible with the current hero
  - no abrupt layout jumps
- Animate:
  - content fade and slight lift on first reveal
  - horizontal timeline card entrance
  - chart series on first mount only
  - graph tab switches with crossfade or slide
- Do not add decorative motion loops outside the hero and intentional chart entrances.
- Honor `prefers-reduced-motion`.

## V1 Scope Cuts
- No LLM-generated result summaries
- No editable chart themes in admin
- No full infographic redesign for admin
- No advanced demographic stories when metadata is incomplete
- No participant-specific wrapped view per round beyond standings and summary cards

## Testing

### Backend
- Individual event analytics
- Team event analytics
- Round-bounded snapshot correctness
- Publish, unpublish, republish flow
- Wildcard-adjusted cumulative ranking
- Elimination handling
- Missing optional metadata handling
- Final publish gating

### Frontend
- Locked and unlocked round cards render correctly
- Public infographic cards and charts render only for published data
- Loading states and graph switches do not cause layout jumps on desktop or mobile
- Reduced-motion behavior disables nonessential motion
- Admin publish table remains readable and operational

### Privacy and policy
- Public page exposes only explicitly published public data
- Participant endpoint returns only the caller's private summary data
- Unpublished round data is not visible on public or participant surfaces

## Implementation Notes
- Reuse existing leaderboard and per-round rank logic rather than rewriting ranking rules from scratch.
- Do not build the engine around dataframe loaders or `numpy`; use existing ORM queries and extracted helpers.
- Build Slice 1 fully before starting the infographic public UI, otherwise frontend payload assumptions will drift from backend rules.
- Treat snapshot schemas as versioned internal contracts between backend and frontend.
