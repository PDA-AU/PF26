# PF26 Database Tables and Schema
Source: `backend/models.py`

Use each top-level heading as a Notion toggle section: `General`, `PDA`, `Persohub`.

## General

### `admin_logs` (`AdminLog`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `admin_id` | `Integer, nullable=False` |
| `admin_register_number` | `String(10), nullable=False` |
| `admin_name` | `String(255), nullable=False` |
| `action` | `String(255), nullable=False` |
| `method` | `String(10), nullable=True` |
| `path` | `String(255), nullable=True` |
| `meta` | `JSON, nullable=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |

### `system_config` (`SystemConfig`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `key` | `String(100), unique=True, nullable=False` |
| `value` | `String(500), nullable=False` |
| `recruit_url` | `String(800), nullable=True` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

### `users` (`PdaUser`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `regno` | `String(20), unique=True, index=True, nullable=False` |
| `email` | `String(255), unique=True, index=True, nullable=False` |
| `hashed_password` | `String(255), nullable=False` |
| `email_verified_at` | `DateTime(timezone=True), nullable=True` |
| `email_verification_token_hash` | `String(255), nullable=True` |
| `email_verification_expires_at` | `DateTime(timezone=True), nullable=True` |
| `email_verification_sent_at` | `DateTime(timezone=True), nullable=True` |
| `password_reset_token_hash` | `String(255), nullable=True` |
| `password_reset_expires_at` | `DateTime(timezone=True), nullable=True` |
| `password_reset_sent_at` | `DateTime(timezone=True), nullable=True` |
| `name` | `String(255), nullable=False` |
| `profile_name` | `String(64), unique=True, index=True, nullable=True` |
| `dob` | `Date, nullable=True` |
| `gender` | `String(10), nullable=True` |
| `phno` | `String(20), nullable=True` |
| `dept` | `String(150), nullable=True` |
| `college` | `String(255), nullable=False, default="MIT", server_default="MIT"` |
| `instagram_url` | `String(500), nullable=True` |
| `linkedin_url` | `String(500), nullable=True` |
| `github_url` | `String(500), nullable=True` |
| `image_url` | `String(500), nullable=True` |
| `json_content` | `JSON, nullable=True` |
| `is_member` | `Boolean, default=False` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

## PDA

### `pda_admins` (`PdaAdmin`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=False, unique=True` |
| `policy` | `JSON, nullable=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |

### `pda_event_attendance` (`PdaEventAttendance`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("pda_events.id"), nullable=False, index=True` |
| `round_id` | `Integer, ForeignKey("pda_event_rounds.id"), nullable=True, index=True` |
| `entity_type` | `SQLEnum(PdaEventEntityType), nullable=False` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=True, index=True` |
| `team_id` | `Integer, ForeignKey("pda_event_teams.id"), nullable=True, index=True` |
| `is_present` | `Boolean, nullable=False, default=False` |
| `marked_by_user_id` | `Integer, ForeignKey("users.id"), nullable=True` |
| `marked_at` | `DateTime(timezone=True), server_default=func.now()` |

### `pda_event_badges` (`PdaEventBadge`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("pda_events.id"), nullable=False, index=True` |
| `title` | `String(255), nullable=False` |
| `image_url` | `String(500), nullable=True` |
| `place` | `SQLEnum(PdaEventBadgePlace), nullable=False` |
| `score` | `Float, nullable=True` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=True, index=True` |
| `team_id` | `Integer, ForeignKey("pda_event_teams.id"), nullable=True, index=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

### `pda_event_invites` (`PdaEventInvite`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("pda_events.id"), nullable=False, index=True` |
| `team_id` | `Integer, ForeignKey("pda_event_teams.id"), nullable=False, index=True` |
| `invited_user_id` | `Integer, ForeignKey("users.id"), nullable=False, index=True` |
| `invited_by_user_id` | `Integer, ForeignKey("users.id"), nullable=False` |
| `status` | `SQLEnum(PdaEventInviteStatus), nullable=False, default=PdaEventInviteStatus.PENDING` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("event_id", "team_id", "invited_user_id", name="uq_pda_event_invite_unique")` |


### `pda_event_logs` (`PdaEventLog`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("pda_events.id", ondelete="SET NULL"), nullable=True, index=True` |
| `event_slug` | `String(120), nullable=False, index=True` |
| `admin_id` | `Integer, nullable=True, index=True` |
| `admin_register_number` | `String(20), nullable=False` |
| `admin_name` | `String(255), nullable=False` |
| `action` | `String(255), nullable=False` |
| `method` | `String(10), nullable=True` |
| `path` | `String(255), nullable=True` |
| `meta` | `JSON, nullable=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |

### `pda_event_registrations` (`PdaEventRegistration`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("pda_events.id"), nullable=False, index=True` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=True, index=True` |
| `team_id` | `Integer, ForeignKey("pda_event_teams.id"), nullable=True, index=True` |
| `entity_type` | `SQLEnum(PdaEventEntityType), nullable=False` |
| `status` | `SQLEnum(PdaEventRegistrationStatus), nullable=False, default=PdaEventRegistrationStatus.ACTIVE` |
| `referral_code` | `String(16), nullable=True` |
| `referred_by` | `String(16), nullable=True` |
| `referral_count` | `Integer, nullable=False, default=0` |
| `registered_at` | `DateTime(timezone=True), server_default=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("event_id", "user_id", name="uq_pda_event_registration_event_user")` |
| `UNIQUE` | `UniqueConstraint("event_id", "team_id", name="uq_pda_event_registration_event_team")` |


### `pda_event_round_panel_assignments` (`PdaEventRoundPanelAssignment`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("pda_events.id"), nullable=False, index=True` |
| `round_id` | `Integer, ForeignKey("pda_event_rounds.id"), nullable=False, index=True` |
| `panel_id` | `Integer, ForeignKey("pda_event_round_panels.id"), nullable=False, index=True` |
| `entity_type` | `SQLEnum(PdaEventEntityType), nullable=False` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=True, index=True` |
| `team_id` | `Integer, ForeignKey("pda_event_teams.id"), nullable=True, index=True` |
| `assigned_by_user_id` | `Integer, ForeignKey("users.id"), nullable=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("round_id", "entity_type", "user_id", "team_id", name="uq_pda_event_round_panel_assignment_entity")` |


### `pda_event_round_panel_members` (`PdaEventRoundPanelMember`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("pda_events.id"), nullable=False, index=True` |
| `round_id` | `Integer, ForeignKey("pda_event_rounds.id"), nullable=False, index=True` |
| `panel_id` | `Integer, ForeignKey("pda_event_round_panels.id"), nullable=False, index=True` |
| `admin_user_id` | `Integer, ForeignKey("users.id"), nullable=False, index=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("round_id", "panel_id", "admin_user_id", name="uq_pda_event_round_panel_member")` |


### `pda_event_round_panels` (`PdaEventRoundPanel`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("pda_events.id"), nullable=False, index=True` |
| `round_id` | `Integer, ForeignKey("pda_event_rounds.id"), nullable=False, index=True` |
| `panel_no` | `Integer, nullable=False` |
| `name` | `String(255), nullable=True` |
| `panel_link` | `String(800), nullable=True` |
| `panel_time` | `DateTime(timezone=True), nullable=True` |
| `instructions` | `Text, nullable=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("round_id", "panel_no", name="uq_pda_event_round_panel_round_no")` |


### `pda_event_round_submissions` (`PdaEventRoundSubmission`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("pda_events.id"), nullable=False, index=True` |
| `round_id` | `Integer, ForeignKey("pda_event_rounds.id"), nullable=False, index=True` |
| `entity_type` | `SQLEnum(PdaEventEntityType), nullable=False` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=True, index=True` |
| `team_id` | `Integer, ForeignKey("pda_event_teams.id"), nullable=True, index=True` |
| `submission_type` | `String(16), nullable=False` |
| `file_url` | `String(800), nullable=True` |
| `file_name` | `String(255), nullable=True` |
| `file_size_bytes` | `BigInteger, nullable=True` |
| `mime_type` | `String(255), nullable=True` |
| `link_url` | `String(800), nullable=True` |
| `notes` | `Text, nullable=True` |
| `version` | `Integer, nullable=False, default=1` |
| `is_locked` | `Boolean, nullable=False, default=False` |
| `submitted_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |
| `updated_by_user_id` | `Integer, ForeignKey("users.id"), nullable=True` |

### `pda_event_rounds` (`PdaEventRound`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("pda_events.id"), nullable=False, index=True` |
| `round_no` | `Integer, nullable=False` |
| `name` | `String(255), nullable=False` |
| `description` | `Text, nullable=True` |
| `round_poster` | `Text, nullable=True` |
| `whatsapp_url` | `String(500), nullable=True` |
| `external_url` | `String(500), nullable=True` |
| `external_url_name` | `String(120), nullable=True, default="Explore Round"` |
| `date` | `DateTime(timezone=True), nullable=True` |
| `mode` | `SQLEnum(PdaEventFormat), nullable=False, default=PdaEventFormat.OFFLINE` |
| `state` | `SQLEnum(PdaEventRoundState), nullable=False, default=PdaEventRoundState.DRAFT` |
| `evaluation_criteria` | `JSON, nullable=True` |
| `elimination_type` | `String(20), nullable=True` |
| `elimination_value` | `Float, nullable=True` |
| `requires_submission` | `Boolean, nullable=False, default=False` |
| `submission_mode` | `String(32), nullable=False, default="file_or_link"` |
| `submission_deadline` | `DateTime(timezone=True), nullable=True` |
| `allowed_mime_types` | `JSON, nullable=True` |
| `max_file_size_mb` | `Integer, nullable=False, default=25` |
| `panel_mode_enabled` | `Boolean, nullable=False, default=False` |
| `panel_team_distribution_mode` | `String(32), nullable=False, default="team_count"` |
| `panel_structure_locked` | `Boolean, nullable=False, default=False` |
| `is_frozen` | `Boolean, default=False` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("event_id", "round_no", name="uq_pda_event_round_event_round_no")` |


### `pda_event_scores` (`PdaEventScore`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("pda_events.id"), nullable=False, index=True` |
| `round_id` | `Integer, ForeignKey("pda_event_rounds.id"), nullable=False, index=True` |
| `entity_type` | `SQLEnum(PdaEventEntityType), nullable=False` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=True, index=True` |
| `team_id` | `Integer, ForeignKey("pda_event_teams.id"), nullable=True, index=True` |
| `criteria_scores` | `JSON, nullable=True` |
| `total_score` | `Float, nullable=False, default=0` |
| `normalized_score` | `Float, nullable=False, default=0` |
| `is_present` | `Boolean, nullable=False, default=False` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

### `pda_event_team_members` (`PdaEventTeamMember`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `team_id` | `Integer, ForeignKey("pda_event_teams.id"), nullable=False, index=True` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=False, index=True` |
| `role` | `String(20), nullable=False, default="member"` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("team_id", "user_id", name="uq_pda_event_team_member_team_user")` |


### `pda_event_teams` (`PdaEventTeam`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("pda_events.id"), nullable=False, index=True` |
| `team_code` | `String(5), nullable=False` |
| `team_name` | `String(255), nullable=False` |
| `team_lead_user_id` | `Integer, ForeignKey("users.id"), nullable=False` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("event_id", "team_code", name="uq_pda_event_team_event_code")` |


### `pda_events` (`PdaEvent`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `slug` | `String(120), unique=True, nullable=False, index=True` |
| `event_code` | `String(20), unique=True, nullable=False, index=True` |
| `club_id` | `Integer, default=1, nullable=False` |
| `title` | `String(255), nullable=False` |
| `description` | `Text, nullable=True` |
| `start_date` | `Date, nullable=True` |
| `end_date` | `Date, nullable=True` |
| `poster_url` | `Text, nullable=True` |
| `whatsapp_url` | `String(500), nullable=True` |
| `external_url_name` | `String(120), nullable=True, default="Join whatsapp channel"` |
| `event_type` | `SQLEnum(PdaEventType), nullable=False` |
| `format` | `SQLEnum(PdaEventFormat), nullable=False` |
| `template_option` | `SQLEnum(PdaEventTemplate), nullable=False` |
| `participant_mode` | `SQLEnum(PdaEventParticipantMode), nullable=False` |
| `round_mode` | `SQLEnum(PdaEventRoundMode), nullable=False` |
| `round_count` | `Integer, nullable=False, default=1` |
| `team_min_size` | `Integer, nullable=True` |
| `team_max_size` | `Integer, nullable=True` |
| `is_visible` | `Boolean, nullable=False, default=True` |
| `registration_open` | `Boolean, nullable=False, default=True` |
| `open_for` | `String(8), nullable=False, default="MIT", server_default="MIT"` |
| `status` | `SQLEnum(PdaEventStatus), nullable=False, default=PdaEventStatus.CLOSED` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

### `pda_gallery` (`PdaGallery`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `photo_url` | `String(500), nullable=False` |
| `caption` | `Text, nullable=True` |
| `tag` | `String(120), nullable=True` |
| `order` | `Integer, default=0` |
| `is_featured` | `Boolean, default=False` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

### `pda_items` (`PdaItem`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `title` | `String(255), nullable=False` |
| `description` | `Text, nullable=True` |
| `tag` | `String(100), nullable=True` |
| `poster_url` | `Text, nullable=True` |
| `start_date` | `Date, nullable=True` |
| `end_date` | `Date, nullable=True` |
| `format` | `String(150), nullable=True` |
| `hero_url` | `String(500), nullable=True` |
| `featured_poster_url` | `Text, nullable=True` |
| `is_featured` | `Boolean, default=False` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

### `pda_resume` (`PdaResume`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `user_id` | `Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True` |
| `s3_url` | `String(800), nullable=False` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

### `pda_team` (`PdaTeam`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=False` |
| `team` | `String(120), nullable=True` |
| `designation` | `String(120), nullable=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

## Persohub

### `persohub_admins` (`PersohubAdmin`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `community_id` | `Integer, ForeignKey("persohub_communities.id", ondelete="CASCADE"), nullable=False, index=True` |
| `user_id` | `Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True` |
| `role` | `String(16), nullable=False, default="admin", server_default="admin"` |
| `is_active` | `Boolean, nullable=False, default=True, server_default="true"` |
| `policy` | `JSON, nullable=True` |
| `created_by_user_id` | `Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("community_id", "user_id", name="uq_persohub_admins_community_user")` |


### `persohub_clubs` (`PersohubClub`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `name` | `String(120), unique=True, nullable=False, index=True` |
| `profile_id` | `String(64), unique=True, nullable=False, index=True` |
| `owner_user_id` | `Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True` |
| `club_url` | `String(500), nullable=True` |
| `club_logo_url` | `String(500), nullable=True` |
| `club_tagline` | `String(255), nullable=True` |
| `club_description` | `Text, nullable=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

### `persohub_communities` (`PersohubCommunity`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `name` | `String(120), nullable=False` |
| `profile_id` | `String(64), unique=True, nullable=False, index=True` |
| `club_id` | `Integer, ForeignKey("persohub_clubs.id"), nullable=True, index=True` |
| `admin_id` | `Integer, ForeignKey("users.id"), nullable=False, index=True` |
| `hashed_password` | `String(255), nullable=False` |
| `logo_url` | `String(500), nullable=True` |
| `description` | `Text, nullable=True` |
| `is_active` | `Boolean, nullable=False, default=True` |
| `is_root` | `Boolean, nullable=False, default=False` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

### `persohub_community_follows` (`PersohubCommunityFollow`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `community_id` | `Integer, ForeignKey("persohub_communities.id"), nullable=False, index=True` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=False, index=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("community_id", "user_id", name="uq_persohub_follow_community_user")` |


### `persohub_event_attendance` (`PersohubEventAttendance`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("persohub_events.id"), nullable=False, index=True` |
| `round_id` | `Integer, ForeignKey("persohub_event_rounds.id"), nullable=True, index=True` |
| `entity_type` | `SQLEnum(PdaEventEntityType), nullable=False` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=True, index=True` |
| `team_id` | `Integer, ForeignKey("persohub_event_teams.id"), nullable=True, index=True` |
| `is_present` | `Boolean, nullable=False, default=False` |
| `marked_by_user_id` | `Integer, ForeignKey("users.id"), nullable=True` |
| `marked_at` | `DateTime(timezone=True), server_default=func.now()` |

### `persohub_event_badges` (`PersohubEventBadge`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("persohub_events.id"), nullable=False, index=True` |
| `title` | `String(255), nullable=False` |
| `image_url` | `String(500), nullable=True` |
| `place` | `SQLEnum(PdaEventBadgePlace), nullable=False` |
| `score` | `Float, nullable=True` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=True, index=True` |
| `team_id` | `Integer, ForeignKey("persohub_event_teams.id"), nullable=True, index=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

### `persohub_event_invites` (`PersohubEventInvite`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("persohub_events.id"), nullable=False, index=True` |
| `team_id` | `Integer, ForeignKey("persohub_event_teams.id"), nullable=False, index=True` |
| `invited_user_id` | `Integer, ForeignKey("users.id"), nullable=False, index=True` |
| `invited_by_user_id` | `Integer, ForeignKey("users.id"), nullable=False` |
| `status` | `SQLEnum(PdaEventInviteStatus), nullable=False, default=PdaEventInviteStatus.PENDING` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("event_id", "team_id", "invited_user_id", name="uq_persohub_event_invite_unique")` |


### `persohub_event_logs` (`PersohubEventLog`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("persohub_events.id"), nullable=True, index=True` |
| `event_slug` | `String(120), nullable=False, index=True` |
| `admin_id` | `Integer, nullable=True, index=True` |
| `admin_register_number` | `String(20), nullable=False` |
| `admin_name` | `String(255), nullable=False` |
| `action` | `String(255), nullable=False` |
| `method` | `String(10), nullable=True` |
| `path` | `String(255), nullable=True` |
| `meta` | `JSON, nullable=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |

### `persohub_event_registrations` (`PersohubEventRegistration`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("persohub_events.id"), nullable=False, index=True` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=True, index=True` |
| `team_id` | `Integer, ForeignKey("persohub_event_teams.id"), nullable=True, index=True` |
| `entity_type` | `SQLEnum(PdaEventEntityType), nullable=False` |
| `status` | `SQLEnum(PdaEventRegistrationStatus), nullable=False, default=PdaEventRegistrationStatus.ACTIVE` |
| `referral_code` | `String(16), nullable=True` |
| `referred_by` | `String(16), nullable=True` |
| `referral_count` | `Integer, nullable=False, default=0` |
| `registered_at` | `DateTime(timezone=True), server_default=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("event_id", "user_id", name="uq_persohub_event_registration_event_user")` |
| `UNIQUE` | `UniqueConstraint("event_id", "team_id", name="uq_persohub_event_registration_event_team")` |


### `persohub_event_round_panel_assignments` (`PersohubEventRoundPanelAssignment`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("persohub_events.id"), nullable=False, index=True` |
| `round_id` | `Integer, ForeignKey("persohub_event_rounds.id"), nullable=False, index=True` |
| `panel_id` | `Integer, ForeignKey("persohub_event_round_panels.id"), nullable=False, index=True` |
| `entity_type` | `SQLEnum(PdaEventEntityType), nullable=False` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=True, index=True` |
| `team_id` | `Integer, ForeignKey("persohub_event_teams.id"), nullable=True, index=True` |
| `assigned_by_user_id` | `Integer, ForeignKey("users.id"), nullable=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("round_id", "entity_type", "user_id", "team_id", name="uq_persohub_event_round_panel_assignment_entity")` |


### `persohub_event_round_panel_members` (`PersohubEventRoundPanelMember`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("persohub_events.id"), nullable=False, index=True` |
| `round_id` | `Integer, ForeignKey("persohub_event_rounds.id"), nullable=False, index=True` |
| `panel_id` | `Integer, ForeignKey("persohub_event_round_panels.id"), nullable=False, index=True` |
| `admin_user_id` | `Integer, ForeignKey("users.id"), nullable=False, index=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("round_id", "panel_id", "admin_user_id", name="uq_persohub_event_round_panel_member")` |


### `persohub_event_round_panels` (`PersohubEventRoundPanel`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("persohub_events.id"), nullable=False, index=True` |
| `round_id` | `Integer, ForeignKey("persohub_event_rounds.id"), nullable=False, index=True` |
| `panel_no` | `Integer, nullable=False` |
| `name` | `String(255), nullable=True` |
| `panel_link` | `String(800), nullable=True` |
| `panel_time` | `DateTime(timezone=True), nullable=True` |
| `instructions` | `Text, nullable=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("round_id", "panel_no", name="uq_persohub_event_round_panel_round_no")` |


### `persohub_event_round_submissions` (`PersohubEventRoundSubmission`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("persohub_events.id"), nullable=False, index=True` |
| `round_id` | `Integer, ForeignKey("persohub_event_rounds.id"), nullable=False, index=True` |
| `entity_type` | `SQLEnum(PdaEventEntityType), nullable=False` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=True, index=True` |
| `team_id` | `Integer, ForeignKey("persohub_event_teams.id"), nullable=True, index=True` |
| `submission_type` | `String(16), nullable=False` |
| `file_url` | `String(800), nullable=True` |
| `file_name` | `String(255), nullable=True` |
| `file_size_bytes` | `BigInteger, nullable=True` |
| `mime_type` | `String(255), nullable=True` |
| `link_url` | `String(800), nullable=True` |
| `notes` | `Text, nullable=True` |
| `version` | `Integer, nullable=False, default=1` |
| `is_locked` | `Boolean, nullable=False, default=False` |
| `submitted_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |
| `updated_by_user_id` | `Integer, ForeignKey("users.id"), nullable=True` |

### `persohub_event_rounds` (`PersohubEventRound`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("persohub_events.id"), nullable=False, index=True` |
| `round_no` | `Integer, nullable=False` |
| `name` | `String(255), nullable=False` |
| `description` | `Text, nullable=True` |
| `round_poster` | `Text, nullable=True` |
| `whatsapp_url` | `String(500), nullable=True` |
| `external_url` | `String(500), nullable=True` |
| `external_url_name` | `String(120), nullable=True, default="Explore Round"` |
| `date` | `DateTime(timezone=True), nullable=True` |
| `mode` | `SQLEnum(PdaEventFormat), nullable=False, default=PdaEventFormat.OFFLINE` |
| `state` | `SQLEnum(PdaEventRoundState), nullable=False, default=PdaEventRoundState.DRAFT` |
| `evaluation_criteria` | `JSON, nullable=True` |
| `elimination_type` | `String(20), nullable=True` |
| `elimination_value` | `Float, nullable=True` |
| `requires_submission` | `Boolean, nullable=False, default=False` |
| `submission_mode` | `String(32), nullable=False, default="file_or_link"` |
| `submission_deadline` | `DateTime(timezone=True), nullable=True` |
| `allowed_mime_types` | `JSON, nullable=True` |
| `max_file_size_mb` | `Integer, nullable=False, default=25` |
| `panel_mode_enabled` | `Boolean, nullable=False, default=False` |
| `panel_team_distribution_mode` | `String(32), nullable=False, default="team_count"` |
| `panel_structure_locked` | `Boolean, nullable=False, default=False` |
| `is_frozen` | `Boolean, default=False` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("event_id", "round_no", name="uq_persohub_event_round_event_round_no")` |


### `persohub_event_scores` (`PersohubEventScore`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("persohub_events.id"), nullable=False, index=True` |
| `round_id` | `Integer, ForeignKey("persohub_event_rounds.id"), nullable=False, index=True` |
| `entity_type` | `SQLEnum(PdaEventEntityType), nullable=False` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=True, index=True` |
| `team_id` | `Integer, ForeignKey("persohub_event_teams.id"), nullable=True, index=True` |
| `criteria_scores` | `JSON, nullable=True` |
| `total_score` | `Float, nullable=False, default=0` |
| `normalized_score` | `Float, nullable=False, default=0` |
| `is_present` | `Boolean, nullable=False, default=False` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

### `persohub_event_team_members` (`PersohubEventTeamMember`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `team_id` | `Integer, ForeignKey("persohub_event_teams.id"), nullable=False, index=True` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=False, index=True` |
| `role` | `String(20), nullable=False, default="member"` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("team_id", "user_id", name="uq_persohub_event_team_member_team_user")` |


### `persohub_event_teams` (`PersohubEventTeam`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `event_id` | `Integer, ForeignKey("persohub_events.id"), nullable=False, index=True` |
| `team_code` | `String(5), nullable=False` |
| `team_name` | `String(255), nullable=False` |
| `team_lead_user_id` | `Integer, ForeignKey("users.id"), nullable=False` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("event_id", "team_code", name="uq_persohub_event_team_event_code")` |


### `persohub_events` (`PersohubEvent`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `slug` | `String(120), unique=True, nullable=False, index=True` |
| `event_code` | `String(20), unique=True, nullable=False, index=True` |
| `club_id` | `Integer, ForeignKey("persohub_clubs.id", ondelete="CASCADE"), nullable=False, index=True` |
| `community_id` | `Integer, ForeignKey("persohub_communities.id", ondelete="SET NULL"), nullable=True, index=True` |
| `title` | `String(255), nullable=False` |
| `description` | `Text, nullable=True` |
| `start_date` | `Date, nullable=True` |
| `end_date` | `Date, nullable=True` |
| `event_time` | `Time, nullable=True` |
| `poster_url` | `Text, nullable=True` |
| `whatsapp_url` | `String(500), nullable=True` |
| `external_url_name` | `String(120), nullable=True, default="Join whatsapp channel"` |
| `event_type` | `SQLEnum(PdaEventType), nullable=False` |
| `format` | `SQLEnum(PdaEventFormat), nullable=False` |
| `template_option` | `SQLEnum(PdaEventTemplate), nullable=False` |
| `participant_mode` | `SQLEnum(PdaEventParticipantMode), nullable=False` |
| `round_mode` | `SQLEnum(PdaEventRoundMode), nullable=False` |
| `round_count` | `Integer, nullable=False, default=1` |
| `team_min_size` | `Integer, nullable=True` |
| `team_max_size` | `Integer, nullable=True` |
| `is_visible` | `Boolean, nullable=False, default=True` |
| `registration_open` | `Boolean, nullable=False, default=True` |
| `open_for` | `String(8), nullable=False, default="MIT", server_default="MIT"` |
| `status` | `SQLEnum(PdaEventStatus), nullable=False, default=PdaEventStatus.CLOSED` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

### `persohub_hashtags` (`PersohubHashtag`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `hashtag_text` | `String(120), unique=True, nullable=False, index=True` |
| `count` | `Integer, nullable=False, default=0` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

### `persohub_post_attachments` (`PersohubPostAttachment`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `post_id` | `Integer, ForeignKey("persohub_posts.id"), nullable=False, index=True` |
| `s3_url` | `String(800), nullable=False` |
| `preview_image_urls` | `JSON, nullable=True` |
| `mime_type` | `String(120), nullable=True` |
| `attachment_kind` | `String(30), nullable=True` |
| `size_bytes` | `Integer, nullable=True` |
| `order_no` | `Integer, nullable=False, default=0` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |

### `persohub_post_comments` (`PersohubPostComment`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `post_id` | `Integer, ForeignKey("persohub_posts.id"), nullable=False, index=True` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=False, index=True` |
| `comment_text` | `Text, nullable=False` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

### `persohub_post_hashtags` (`PersohubPostHashtag`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `post_id` | `Integer, ForeignKey("persohub_posts.id"), nullable=False, index=True` |
| `hashtag_id` | `Integer, ForeignKey("persohub_hashtags.id"), nullable=False, index=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("post_id", "hashtag_id", name="uq_persohub_post_hashtag")` |


### `persohub_post_likes` (`PersohubPostLike`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `post_id` | `Integer, ForeignKey("persohub_posts.id"), nullable=False, index=True` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=False, index=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("post_id", "user_id", name="uq_persohub_like_post_user")` |


### `persohub_post_mentions` (`PersohubPostMention`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `post_id` | `Integer, ForeignKey("persohub_posts.id"), nullable=False, index=True` |
| `user_id` | `Integer, ForeignKey("users.id"), nullable=False, index=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("post_id", "user_id", name="uq_persohub_post_mention")` |


### `persohub_posts` (`PersohubPost`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `community_id` | `Integer, ForeignKey("persohub_communities.id"), nullable=False, index=True` |
| `admin_id` | `Integer, ForeignKey("users.id"), nullable=False, index=True` |
| `slug_token` | `String(64), unique=True, nullable=False, index=True` |
| `description` | `Text, nullable=True` |
| `like_count` | `Integer, nullable=False, default=0` |
| `comment_count` | `Integer, nullable=False, default=0` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

### `persohub_sympo_events` (`PersohubSympoEvent`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `sympo_id` | `Integer, ForeignKey("persohub_sympos.id"), nullable=False, index=True` |
| `event_id` | `Integer, ForeignKey("persohub_events.id"), nullable=False, index=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("sympo_id", "event_id", name="uq_persohub_sympo_events_pair")` |
| `UNIQUE` | `UniqueConstraint("event_id", name="uq_persohub_sympo_events_event")` |


### `persohub_sympos` (`PersohubSympo`)
| Column | Definition |
| --- | --- |
| `id` | `Integer, primary_key=True, index=True` |
| `name` | `String(255), nullable=False` |
| `organising_club_id` | `Integer, ForeignKey("persohub_clubs.id"), nullable=False, index=True` |
| `content` | `JSON, nullable=True` |
| `created_at` | `DateTime(timezone=True), server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True), onupdate=func.now()` |

| Constraint Type | Definition |
| --- | --- |
| `UNIQUE` | `UniqueConstraint("organising_club_id", "name", name="uq_persohub_sympos_club_name")` |
