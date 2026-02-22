from sqlalchemy import Column, Integer, BigInteger, String, Boolean, DateTime, Float, Date, Time, Enum as SQLEnum, ForeignKey, Text, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


class Department(enum.Enum):
    AI_DS = "Artificial Intelligence and Data Science"
    AERO = "Aerospace Engineering"
    AUTO = "Automobile Engineering"
    CT = "Computer Technology"
    ECE = "Electronics and Communication Engineering"
    EIE = "Electronics and Instrumentation Engineering"
    PROD = "Production Technology"
    RAE = "Robotics and Automation"
    RPT = "Rubber and Plastics Technology"
    IT = "Information Technology"


class YearOfStudy(enum.Enum):
    FIRST = "First Year"
    SECOND = "Second Year"
    THIRD = "Third Year"


class Gender(enum.Enum):
    MALE = "Male"
    FEMALE = "Female"


class UserRole(enum.Enum):
    PARTICIPANT = "participant"
    ADMIN = "admin"


class RoundState(enum.Enum):
    DRAFT = "Draft"
    PUBLISHED = "Published"
    ACTIVE = "Active"
    COMPLETED = "Completed"


class ParticipantStatus(enum.Enum):
    ACTIVE = "Active"
    ELIMINATED = "Eliminated"


class RoundMode(enum.Enum):
    ONLINE = "Online"
    OFFLINE = "Offline"


class PdaUser(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    regno = Column(String(20), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    email_verification_token_hash = Column(String(255), nullable=True)
    email_verification_expires_at = Column(DateTime(timezone=True), nullable=True)
    email_verification_sent_at = Column(DateTime(timezone=True), nullable=True)
    password_reset_token_hash = Column(String(255), nullable=True)
    password_reset_expires_at = Column(DateTime(timezone=True), nullable=True)
    password_reset_sent_at = Column(DateTime(timezone=True), nullable=True)
    name = Column(String(255), nullable=False)
    profile_name = Column(String(64), unique=True, index=True, nullable=True)
    dob = Column(Date, nullable=True)
    gender = Column(String(10), nullable=True)
    phno = Column(String(20), nullable=True)
    dept = Column(String(150), nullable=True)
    college = Column(String(255), nullable=False, default="MIT", server_default="MIT")
    instagram_url = Column(String(500), nullable=True)
    linkedin_url = Column(String(500), nullable=True)
    github_url = Column(String(500), nullable=True)
    image_url = Column(String(500), nullable=True)
    json_content = Column(JSON, nullable=True)
    is_member = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None


class AdminLog(Base):
    __tablename__ = "admin_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, nullable=False)
    admin_register_number = Column(String(10), nullable=False)
    admin_name = Column(String(255), nullable=False)
    action = Column(String(255), nullable=False)
    method = Column(String(10), nullable=True)
    path = Column(String(255), nullable=True)
    meta = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PdaEventLog(Base):
    __tablename__ = "pda_event_logs"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("pda_events.id", ondelete="SET NULL"), nullable=True, index=True)
    event_slug = Column(String(120), nullable=False, index=True)
    admin_id = Column(Integer, nullable=True, index=True)
    admin_register_number = Column(String(20), nullable=False)
    admin_name = Column(String(255), nullable=False)
    action = Column(String(255), nullable=False)
    method = Column(String(10), nullable=True)
    path = Column(String(255), nullable=True)
    meta = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PdaAdmin(Base):
    __tablename__ = "pda_admins"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    policy = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SystemConfig(Base):
    __tablename__ = "system_config"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(String(500), nullable=False)
    recruit_url = Column(String(800), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PdaItem(Base):
    __tablename__ = "pda_items"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(20), nullable=False)  # "program" | "event"
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    tag = Column(String(100), nullable=True)
    poster_url = Column(Text, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    format = Column(String(150), nullable=True)
    hero_url = Column(String(500), nullable=True)
    featured_poster_url = Column(Text, nullable=True)
    is_featured = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PdaTeam(Base):
    __tablename__ = "pda_team"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    team = Column(String(120), nullable=True)
    designation = Column(String(120), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PdaResume(Base):
    __tablename__ = "pda_resume"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    s3_url = Column(String(800), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PdaGallery(Base):
    __tablename__ = "pda_gallery"

    id = Column(Integer, primary_key=True, index=True)
    photo_url = Column(String(500), nullable=False)
    caption = Column(Text, nullable=True)
    tag = Column(String(120), nullable=True)
    order = Column(Integer, default=0)
    is_featured = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PdaEventType(enum.Enum):
    TECHNICAL = "Technical"
    FUNTECHINICAL = "FunTechinical"
    HACKATHON = "Hackathon"
    SIGNATURE = "Signature"
    NONTECHINICAL = "NonTechinical"
    SESSION = "Session"
    WORKSHOP = "Workshop"
    EVENT = "Event"


class PdaEventFormat(enum.Enum):
    ONLINE = "Online"
    OFFLINE = "Offline"
    HYBRID = "Hybrid"


class PdaEventTemplate(enum.Enum):
    ATTENDANCE_ONLY = "attendance_only"
    ATTENDANCE_SCORING = "attendance_scoring"


class PdaEventParticipantMode(enum.Enum):
    INDIVIDUAL = "individual"
    TEAM = "team"


class PdaEventRoundMode(enum.Enum):
    SINGLE = "single"
    MULTI = "multi"


class PdaEventStatus(enum.Enum):
    OPEN = "open"
    CLOSED = "closed"


class PdaEventRegistrationStatus(enum.Enum):
    ACTIVE = "Active"
    ELIMINATED = "Eliminated"


class PdaEventEntityType(enum.Enum):
    USER = "user"
    TEAM = "team"


class PdaEventRoundState(enum.Enum):
    DRAFT = "Draft"
    PUBLISHED = "Published"
    ACTIVE = "Active"
    COMPLETED = "Completed"
    REVEAL = "Reveal"


class PdaEventInviteStatus(enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class PdaEventBadgePlace(enum.Enum):
    WINNER = "Winner"
    RUNNER = "Runner"
    SPECIAL_MENTION = "SpecialMention"


# Persohub event namespace intentionally reuses PDA enum/value semantics.
PersohubEventType = PdaEventType
PersohubEventFormat = PdaEventFormat
PersohubEventTemplate = PdaEventTemplate
PersohubEventParticipantMode = PdaEventParticipantMode
PersohubEventRoundMode = PdaEventRoundMode
PersohubEventStatus = PdaEventStatus
PersohubEventRegistrationStatus = PdaEventRegistrationStatus
PersohubEventEntityType = PdaEventEntityType
PersohubEventRoundState = PdaEventRoundState
PersohubEventInviteStatus = PdaEventInviteStatus
PersohubEventBadgePlace = PdaEventBadgePlace


class PdaEvent(Base):
    __tablename__ = "pda_events"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(120), unique=True, nullable=False, index=True)
    event_code = Column(String(20), unique=True, nullable=False, index=True)
    club_id = Column(Integer, default=1, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    poster_url = Column(Text, nullable=True)
    whatsapp_url = Column(String(500), nullable=True)
    external_url_name = Column(String(120), nullable=True, default="Join whatsapp channel")
    event_type = Column(SQLEnum(PdaEventType), nullable=False)
    format = Column(SQLEnum(PdaEventFormat), nullable=False)
    template_option = Column(SQLEnum(PdaEventTemplate), nullable=False)
    participant_mode = Column(SQLEnum(PdaEventParticipantMode), nullable=False)
    round_mode = Column(SQLEnum(PdaEventRoundMode), nullable=False)
    round_count = Column(Integer, nullable=False, default=1)
    team_min_size = Column(Integer, nullable=True)
    team_max_size = Column(Integer, nullable=True)
    is_visible = Column(Boolean, nullable=False, default=True)
    registration_open = Column(Boolean, nullable=False, default=True)
    open_for = Column(String(8), nullable=False, default="MIT", server_default="MIT")
    status = Column(SQLEnum(PdaEventStatus), nullable=False, default=PdaEventStatus.CLOSED)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PdaEventRegistration(Base):
    __tablename__ = "pda_event_registrations"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_pda_event_registration_event_user"),
        UniqueConstraint("event_id", "team_id", name="uq_pda_event_registration_event_team"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("pda_events.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("pda_event_teams.id"), nullable=True, index=True)
    entity_type = Column(SQLEnum(PdaEventEntityType), nullable=False)
    status = Column(SQLEnum(PdaEventRegistrationStatus), nullable=False, default=PdaEventRegistrationStatus.ACTIVE)
    referral_code = Column(String(16), nullable=True)
    referred_by = Column(String(16), nullable=True)
    referral_count = Column(Integer, nullable=False, default=0)
    registered_at = Column(DateTime(timezone=True), server_default=func.now())


class PdaEventTeam(Base):
    __tablename__ = "pda_event_teams"
    __table_args__ = (
        UniqueConstraint("event_id", "team_code", name="uq_pda_event_team_event_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("pda_events.id"), nullable=False, index=True)
    team_code = Column(String(5), nullable=False)
    team_name = Column(String(255), nullable=False)
    team_lead_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PdaEventTeamMember(Base):
    __tablename__ = "pda_event_team_members"
    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_pda_event_team_member_team_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("pda_event_teams.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(20), nullable=False, default="member")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PdaEventRound(Base):
    __tablename__ = "pda_event_rounds"
    __table_args__ = (
        UniqueConstraint("event_id", "round_no", name="uq_pda_event_round_event_round_no"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("pda_events.id"), nullable=False, index=True)
    round_no = Column(Integer, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    round_poster = Column(Text, nullable=True)
    whatsapp_url = Column(String(500), nullable=True)
    external_url = Column(String(500), nullable=True)
    external_url_name = Column(String(120), nullable=True, default="Explore Round")
    date = Column(DateTime(timezone=True), nullable=True)
    mode = Column(SQLEnum(PdaEventFormat), nullable=False, default=PdaEventFormat.OFFLINE)
    state = Column(SQLEnum(PdaEventRoundState), nullable=False, default=PdaEventRoundState.DRAFT)
    evaluation_criteria = Column(JSON, nullable=True)
    elimination_type = Column(String(20), nullable=True)
    elimination_value = Column(Float, nullable=True)
    requires_submission = Column(Boolean, nullable=False, default=False)
    submission_mode = Column(String(32), nullable=False, default="file_or_link")
    submission_deadline = Column(DateTime(timezone=True), nullable=True)
    allowed_mime_types = Column(JSON, nullable=True)
    max_file_size_mb = Column(Integer, nullable=False, default=25)
    panel_mode_enabled = Column(Boolean, nullable=False, default=False)
    panel_team_distribution_mode = Column(String(32), nullable=False, default="team_count")
    panel_structure_locked = Column(Boolean, nullable=False, default=False)
    is_frozen = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PdaEventRoundPanel(Base):
    __tablename__ = "pda_event_round_panels"
    __table_args__ = (
        UniqueConstraint("round_id", "panel_no", name="uq_pda_event_round_panel_round_no"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("pda_events.id"), nullable=False, index=True)
    round_id = Column(Integer, ForeignKey("pda_event_rounds.id"), nullable=False, index=True)
    panel_no = Column(Integer, nullable=False)
    name = Column(String(255), nullable=True)
    panel_link = Column(String(800), nullable=True)
    panel_time = Column(DateTime(timezone=True), nullable=True)
    instructions = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PdaEventRoundPanelMember(Base):
    __tablename__ = "pda_event_round_panel_members"
    __table_args__ = (
        UniqueConstraint("round_id", "panel_id", "admin_user_id", name="uq_pda_event_round_panel_member"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("pda_events.id"), nullable=False, index=True)
    round_id = Column(Integer, ForeignKey("pda_event_rounds.id"), nullable=False, index=True)
    panel_id = Column(Integer, ForeignKey("pda_event_round_panels.id"), nullable=False, index=True)
    admin_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PdaEventRoundPanelAssignment(Base):
    __tablename__ = "pda_event_round_panel_assignments"
    __table_args__ = (
        UniqueConstraint("round_id", "entity_type", "user_id", "team_id", name="uq_pda_event_round_panel_assignment_entity"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("pda_events.id"), nullable=False, index=True)
    round_id = Column(Integer, ForeignKey("pda_event_rounds.id"), nullable=False, index=True)
    panel_id = Column(Integer, ForeignKey("pda_event_round_panels.id"), nullable=False, index=True)
    entity_type = Column(SQLEnum(PdaEventEntityType), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("pda_event_teams.id"), nullable=True, index=True)
    assigned_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PdaEventAttendance(Base):
    __tablename__ = "pda_event_attendance"
    __table_args__ = (
        UniqueConstraint(
            "event_id",
            "round_id",
            "entity_type",
            "user_id",
            "team_id",
            name="uq_pda_event_attendance_entity",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("pda_events.id"), nullable=False, index=True)
    round_id = Column(Integer, ForeignKey("pda_event_rounds.id"), nullable=True, index=True)
    entity_type = Column(SQLEnum(PdaEventEntityType), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("pda_event_teams.id"), nullable=True, index=True)
    is_present = Column(Boolean, nullable=False, default=False)
    marked_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    marked_at = Column(DateTime(timezone=True), server_default=func.now())


class PdaEventScore(Base):
    __tablename__ = "pda_event_scores"
    __table_args__ = (
        UniqueConstraint(
            "event_id",
            "round_id",
            "entity_type",
            "user_id",
            "team_id",
            name="uq_pda_event_score_entity",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("pda_events.id"), nullable=False, index=True)
    round_id = Column(Integer, ForeignKey("pda_event_rounds.id"), nullable=False, index=True)
    entity_type = Column(SQLEnum(PdaEventEntityType), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("pda_event_teams.id"), nullable=True, index=True)
    criteria_scores = Column(JSON, nullable=True)
    total_score = Column(Float, nullable=False, default=0)
    normalized_score = Column(Float, nullable=False, default=0)
    is_present = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PdaEventRoundSubmission(Base):
    __tablename__ = "pda_event_round_submissions"
    __table_args__ = (
        UniqueConstraint(
            "event_id",
            "round_id",
            "entity_type",
            "user_id",
            "team_id",
            name="uq_pda_event_round_submission_entity",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("pda_events.id"), nullable=False, index=True)
    round_id = Column(Integer, ForeignKey("pda_event_rounds.id"), nullable=False, index=True)
    entity_type = Column(SQLEnum(PdaEventEntityType), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("pda_event_teams.id"), nullable=True, index=True)
    submission_type = Column(String(16), nullable=False)
    file_url = Column(String(800), nullable=True)
    file_name = Column(String(255), nullable=True)
    file_size_bytes = Column(BigInteger, nullable=True)
    mime_type = Column(String(255), nullable=True)
    link_url = Column(String(800), nullable=True)
    notes = Column(Text, nullable=True)
    version = Column(Integer, nullable=False, default=1)
    is_locked = Column(Boolean, nullable=False, default=False)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)


class PdaEventBadge(Base):
    __tablename__ = "pda_event_badges"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("pda_events.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    image_url = Column(String(500), nullable=True)
    place = Column(SQLEnum(PdaEventBadgePlace), nullable=False)
    score = Column(Float, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("pda_event_teams.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PdaEventInvite(Base):
    __tablename__ = "pda_event_invites"
    __table_args__ = (
        UniqueConstraint("event_id", "team_id", "invited_user_id", name="uq_pda_event_invite_unique"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("pda_events.id"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("pda_event_teams.id"), nullable=False, index=True)
    invited_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    invited_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(SQLEnum(PdaEventInviteStatus), nullable=False, default=PdaEventInviteStatus.PENDING)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubEvent(Base):
    __tablename__ = "persohub_events"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(120), unique=True, nullable=False, index=True)
    event_code = Column(String(20), unique=True, nullable=False, index=True)
    community_id = Column(Integer, ForeignKey("persohub_communities.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    event_time = Column(Time, nullable=True)
    poster_url = Column(Text, nullable=True)
    whatsapp_url = Column(String(500), nullable=True)
    external_url_name = Column(String(120), nullable=True, default="Join whatsapp channel")
    event_type = Column(SQLEnum(PdaEventType), nullable=False)
    format = Column(SQLEnum(PdaEventFormat), nullable=False)
    template_option = Column(SQLEnum(PdaEventTemplate), nullable=False)
    participant_mode = Column(SQLEnum(PdaEventParticipantMode), nullable=False)
    round_mode = Column(SQLEnum(PdaEventRoundMode), nullable=False)
    round_count = Column(Integer, nullable=False, default=1)
    team_min_size = Column(Integer, nullable=True)
    team_max_size = Column(Integer, nullable=True)
    is_visible = Column(Boolean, nullable=False, default=True)
    registration_open = Column(Boolean, nullable=False, default=True)
    open_for = Column(String(8), nullable=False, default="MIT", server_default="MIT")
    status = Column(SQLEnum(PdaEventStatus), nullable=False, default=PdaEventStatus.CLOSED)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubSympo(Base):
    __tablename__ = "persohub_sympos"
    __table_args__ = (
        UniqueConstraint("organising_club_id", "name", name="uq_persohub_sympos_club_name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    organising_club_id = Column(Integer, ForeignKey("persohub_clubs.id"), nullable=False, index=True)
    content = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubSympoEvent(Base):
    __tablename__ = "persohub_sympo_events"
    __table_args__ = (
        UniqueConstraint("sympo_id", "event_id", name="uq_persohub_sympo_events_pair"),
        UniqueConstraint("event_id", name="uq_persohub_sympo_events_event"),
    )

    id = Column(Integer, primary_key=True, index=True)
    sympo_id = Column(Integer, ForeignKey("persohub_sympos.id"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("persohub_events.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PersohubEventRegistration(Base):
    __tablename__ = "persohub_event_registrations"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_persohub_event_registration_event_user"),
        UniqueConstraint("event_id", "team_id", name="uq_persohub_event_registration_event_team"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("persohub_events.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("persohub_event_teams.id"), nullable=True, index=True)
    entity_type = Column(SQLEnum(PdaEventEntityType), nullable=False)
    status = Column(SQLEnum(PdaEventRegistrationStatus), nullable=False, default=PdaEventRegistrationStatus.ACTIVE)
    referral_code = Column(String(16), nullable=True)
    referred_by = Column(String(16), nullable=True)
    referral_count = Column(Integer, nullable=False, default=0)
    registered_at = Column(DateTime(timezone=True), server_default=func.now())


class PersohubEventTeam(Base):
    __tablename__ = "persohub_event_teams"
    __table_args__ = (
        UniqueConstraint("event_id", "team_code", name="uq_persohub_event_team_event_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("persohub_events.id"), nullable=False, index=True)
    team_code = Column(String(5), nullable=False)
    team_name = Column(String(255), nullable=False)
    team_lead_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubEventTeamMember(Base):
    __tablename__ = "persohub_event_team_members"
    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_persohub_event_team_member_team_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("persohub_event_teams.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(20), nullable=False, default="member")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubEventRound(Base):
    __tablename__ = "persohub_event_rounds"
    __table_args__ = (
        UniqueConstraint("event_id", "round_no", name="uq_persohub_event_round_event_round_no"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("persohub_events.id"), nullable=False, index=True)
    round_no = Column(Integer, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    round_poster = Column(Text, nullable=True)
    whatsapp_url = Column(String(500), nullable=True)
    external_url = Column(String(500), nullable=True)
    external_url_name = Column(String(120), nullable=True, default="Explore Round")
    date = Column(DateTime(timezone=True), nullable=True)
    mode = Column(SQLEnum(PdaEventFormat), nullable=False, default=PdaEventFormat.OFFLINE)
    state = Column(SQLEnum(PdaEventRoundState), nullable=False, default=PdaEventRoundState.DRAFT)
    evaluation_criteria = Column(JSON, nullable=True)
    elimination_type = Column(String(20), nullable=True)
    elimination_value = Column(Float, nullable=True)
    requires_submission = Column(Boolean, nullable=False, default=False)
    submission_mode = Column(String(32), nullable=False, default="file_or_link")
    submission_deadline = Column(DateTime(timezone=True), nullable=True)
    allowed_mime_types = Column(JSON, nullable=True)
    max_file_size_mb = Column(Integer, nullable=False, default=25)
    panel_mode_enabled = Column(Boolean, nullable=False, default=False)
    panel_team_distribution_mode = Column(String(32), nullable=False, default="team_count")
    panel_structure_locked = Column(Boolean, nullable=False, default=False)
    is_frozen = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubEventRoundPanel(Base):
    __tablename__ = "persohub_event_round_panels"
    __table_args__ = (
        UniqueConstraint("round_id", "panel_no", name="uq_persohub_event_round_panel_round_no"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("persohub_events.id"), nullable=False, index=True)
    round_id = Column(Integer, ForeignKey("persohub_event_rounds.id"), nullable=False, index=True)
    panel_no = Column(Integer, nullable=False)
    name = Column(String(255), nullable=True)
    panel_link = Column(String(800), nullable=True)
    panel_time = Column(DateTime(timezone=True), nullable=True)
    instructions = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubEventRoundPanelMember(Base):
    __tablename__ = "persohub_event_round_panel_members"
    __table_args__ = (
        UniqueConstraint("round_id", "panel_id", "admin_user_id", name="uq_persohub_event_round_panel_member"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("persohub_events.id"), nullable=False, index=True)
    round_id = Column(Integer, ForeignKey("persohub_event_rounds.id"), nullable=False, index=True)
    panel_id = Column(Integer, ForeignKey("persohub_event_round_panels.id"), nullable=False, index=True)
    admin_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PersohubEventRoundPanelAssignment(Base):
    __tablename__ = "persohub_event_round_panel_assignments"
    __table_args__ = (
        UniqueConstraint("round_id", "entity_type", "user_id", "team_id", name="uq_persohub_event_round_panel_assignment_entity"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("persohub_events.id"), nullable=False, index=True)
    round_id = Column(Integer, ForeignKey("persohub_event_rounds.id"), nullable=False, index=True)
    panel_id = Column(Integer, ForeignKey("persohub_event_round_panels.id"), nullable=False, index=True)
    entity_type = Column(SQLEnum(PdaEventEntityType), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("persohub_event_teams.id"), nullable=True, index=True)
    assigned_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubEventRoundSubmission(Base):
    __tablename__ = "persohub_event_round_submissions"
    __table_args__ = (
        UniqueConstraint(
            "event_id",
            "round_id",
            "entity_type",
            "user_id",
            "team_id",
            name="uq_persohub_event_round_submission_entity",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("persohub_events.id"), nullable=False, index=True)
    round_id = Column(Integer, ForeignKey("persohub_event_rounds.id"), nullable=False, index=True)
    entity_type = Column(SQLEnum(PdaEventEntityType), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("persohub_event_teams.id"), nullable=True, index=True)
    submission_type = Column(String(16), nullable=False)
    file_url = Column(String(800), nullable=True)
    file_name = Column(String(255), nullable=True)
    file_size_bytes = Column(BigInteger, nullable=True)
    mime_type = Column(String(255), nullable=True)
    link_url = Column(String(800), nullable=True)
    notes = Column(Text, nullable=True)
    version = Column(Integer, nullable=False, default=1)
    is_locked = Column(Boolean, nullable=False, default=False)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)


class PersohubEventAttendance(Base):
    __tablename__ = "persohub_event_attendance"
    __table_args__ = (
        UniqueConstraint(
            "event_id",
            "round_id",
            "entity_type",
            "user_id",
            "team_id",
            name="uq_persohub_event_attendance_entity",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("persohub_events.id"), nullable=False, index=True)
    round_id = Column(Integer, ForeignKey("persohub_event_rounds.id"), nullable=True, index=True)
    entity_type = Column(SQLEnum(PdaEventEntityType), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("persohub_event_teams.id"), nullable=True, index=True)
    is_present = Column(Boolean, nullable=False, default=False)
    marked_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    marked_at = Column(DateTime(timezone=True), server_default=func.now())


class PersohubEventScore(Base):
    __tablename__ = "persohub_event_scores"
    __table_args__ = (
        UniqueConstraint(
            "event_id",
            "round_id",
            "entity_type",
            "user_id",
            "team_id",
            name="uq_persohub_event_score_entity",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("persohub_events.id"), nullable=False, index=True)
    round_id = Column(Integer, ForeignKey("persohub_event_rounds.id"), nullable=False, index=True)
    entity_type = Column(SQLEnum(PdaEventEntityType), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("persohub_event_teams.id"), nullable=True, index=True)
    criteria_scores = Column(JSON, nullable=True)
    total_score = Column(Float, nullable=False, default=0)
    normalized_score = Column(Float, nullable=False, default=0)
    is_present = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubEventBadge(Base):
    __tablename__ = "persohub_event_badges"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("persohub_events.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    image_url = Column(String(500), nullable=True)
    place = Column(SQLEnum(PdaEventBadgePlace), nullable=False)
    score = Column(Float, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("persohub_event_teams.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubEventInvite(Base):
    __tablename__ = "persohub_event_invites"
    __table_args__ = (
        UniqueConstraint("event_id", "team_id", "invited_user_id", name="uq_persohub_event_invite_unique"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("persohub_events.id"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("persohub_event_teams.id"), nullable=False, index=True)
    invited_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    invited_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(SQLEnum(PdaEventInviteStatus), nullable=False, default=PdaEventInviteStatus.PENDING)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubEventLog(Base):
    __tablename__ = "persohub_event_logs"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("persohub_events.id"), nullable=True, index=True)
    event_slug = Column(String(120), nullable=False, index=True)
    admin_id = Column(Integer, nullable=True, index=True)
    admin_register_number = Column(String(20), nullable=False)
    admin_name = Column(String(255), nullable=False)
    action = Column(String(255), nullable=False)
    method = Column(String(10), nullable=True)
    path = Column(String(255), nullable=True)
    meta = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PersohubClub(Base):
    __tablename__ = "persohub_clubs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), unique=True, nullable=False, index=True)
    profile_id = Column(String(64), unique=True, nullable=False, index=True)
    club_url = Column(String(500), nullable=True)
    club_logo_url = Column(String(500), nullable=True)
    club_tagline = Column(String(255), nullable=True)
    club_description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubCommunity(Base):
    __tablename__ = "persohub_communities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    profile_id = Column(String(64), unique=True, nullable=False, index=True)
    club_id = Column(Integer, ForeignKey("persohub_clubs.id"), nullable=True, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    logo_url = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    is_root = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubCommunityFollow(Base):
    __tablename__ = "persohub_community_follows"
    __table_args__ = (
        UniqueConstraint("community_id", "user_id", name="uq_persohub_follow_community_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(Integer, ForeignKey("persohub_communities.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PersohubPost(Base):
    __tablename__ = "persohub_posts"

    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(Integer, ForeignKey("persohub_communities.id"), nullable=False, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    slug_token = Column(String(64), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    like_count = Column(Integer, nullable=False, default=0)
    comment_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubPostAttachment(Base):
    __tablename__ = "persohub_post_attachments"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("persohub_posts.id"), nullable=False, index=True)
    s3_url = Column(String(800), nullable=False)
    preview_image_urls = Column(JSON, nullable=True)
    mime_type = Column(String(120), nullable=True)
    attachment_kind = Column(String(30), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    order_no = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PersohubPostLike(Base):
    __tablename__ = "persohub_post_likes"
    __table_args__ = (
        UniqueConstraint("post_id", "user_id", name="uq_persohub_like_post_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("persohub_posts.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PersohubPostComment(Base):
    __tablename__ = "persohub_post_comments"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("persohub_posts.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    comment_text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubHashtag(Base):
    __tablename__ = "persohub_hashtags"

    id = Column(Integer, primary_key=True, index=True)
    hashtag_text = Column(String(120), unique=True, nullable=False, index=True)
    count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PersohubPostHashtag(Base):
    __tablename__ = "persohub_post_hashtags"
    __table_args__ = (
        UniqueConstraint("post_id", "hashtag_id", name="uq_persohub_post_hashtag"),
    )

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("persohub_posts.id"), nullable=False, index=True)
    hashtag_id = Column(Integer, ForeignKey("persohub_hashtags.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PersohubPostMention(Base):
    __tablename__ = "persohub_post_mentions"
    __table_args__ = (
        UniqueConstraint("post_id", "user_id", name="uq_persohub_post_mention"),
    )

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("persohub_posts.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
