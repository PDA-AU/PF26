from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Date, Enum as SQLEnum, ForeignKey, Text, JSON, UniqueConstraint
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


class Event(Base):
    __tablename__ = "pf_events"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    is_active = Column(Boolean, default=True)


class Participant(Base):
    __tablename__ = "participants"
    
    id = Column(Integer, primary_key=True, index=True)
    register_number = Column(String(10), unique=True, index=True, nullable=False)
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
    phone = Column(String(10), nullable=False)
    gender = Column(SQLEnum(Gender), nullable=False)
    department = Column(SQLEnum(Department), nullable=False)
    year_of_study = Column(SQLEnum(YearOfStudy), nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.PARTICIPANT, nullable=False)
    referral_code = Column(String(5), unique=True, index=True, nullable=False)
    referred_by = Column(String(5), nullable=True)
    referral_count = Column(Integer, default=0)
    profile_picture = Column(String(500), nullable=True)
    status = Column(SQLEnum(ParticipantStatus), default=ParticipantStatus.ACTIVE, nullable=False)
    event_id = Column(Integer, ForeignKey("pf_events.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    scores = relationship("Score", back_populates="participant")

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None


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


class Round(Base):
    __tablename__ = "rounds"
    
    id = Column(Integer, primary_key=True, index=True)
    round_no = Column(String(10), unique=True, nullable=False)  # PF01, PF02, etc.
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    tags = Column(JSON, nullable=True)  # ["Creative", "Aptitude", "Communication"]
    date = Column(DateTime(timezone=True), nullable=True)
    mode = Column(SQLEnum(RoundMode), nullable=False)
    conducted_by = Column(String(255), nullable=True)
    state = Column(SQLEnum(RoundState), default=RoundState.DRAFT, nullable=False)
    evaluation_criteria = Column(JSON, nullable=True)  # [{"name": "Creativity", "max_marks": 25}, ...]
    description_pdf = Column(String(500), nullable=True)
    elimination_type = Column(String(20), nullable=True)  # "top_k" or "min_score"
    elimination_value = Column(Float, nullable=True)  # K value or minimum score
    is_frozen = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    scores = relationship("Score", back_populates="round")


class Score(Base):
    __tablename__ = "scores"
    
    id = Column(Integer, primary_key=True, index=True)
    participant_id = Column(Integer, ForeignKey("participants.id"), nullable=False)
    round_id = Column(Integer, ForeignKey("rounds.id"), nullable=False)
    criteria_scores = Column(JSON, nullable=True)  # {"Creativity": 20, "Aptitude": 25, ...}
    total_score = Column(Float, default=0)
    normalized_score = Column(Float, default=0)  # Normalized to 100
    is_present = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    participant = relationship("Participant", back_populates="scores")
    round = relationship("Round", back_populates="scores")


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
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PdaItem(Base):
    __tablename__ = "pda_items"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(20), nullable=False)  # "program" | "event"
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    tag = Column(String(100), nullable=True)
    poster_url = Column(String(500), nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    format = Column(String(150), nullable=True)
    hero_caption = Column(Text, nullable=True)
    hero_url = Column(String(500), nullable=True)
    featured_poster_url = Column(String(500), nullable=True)
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


class PdaEventInviteStatus(enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class PdaEventBadgePlace(enum.Enum):
    WINNER = "Winner"
    RUNNER = "Runner"
    SPECIAL_MENTION = "SpecialMention"


class PdaEvent(Base):
    __tablename__ = "pda_events"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(120), unique=True, nullable=False, index=True)
    event_code = Column(String(20), unique=True, nullable=False, index=True)
    club_id = Column(Integer, default=1, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    poster_url = Column(String(500), nullable=True)
    event_type = Column(SQLEnum(PdaEventType), nullable=False)
    format = Column(SQLEnum(PdaEventFormat), nullable=False)
    template_option = Column(SQLEnum(PdaEventTemplate), nullable=False)
    participant_mode = Column(SQLEnum(PdaEventParticipantMode), nullable=False)
    round_mode = Column(SQLEnum(PdaEventRoundMode), nullable=False)
    round_count = Column(Integer, nullable=False, default=1)
    team_min_size = Column(Integer, nullable=True)
    team_max_size = Column(Integer, nullable=True)
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
    date = Column(DateTime(timezone=True), nullable=True)
    mode = Column(SQLEnum(PdaEventFormat), nullable=False, default=PdaEventFormat.OFFLINE)
    state = Column(SQLEnum(PdaEventRoundState), nullable=False, default=PdaEventRoundState.DRAFT)
    evaluation_criteria = Column(JSON, nullable=True)
    elimination_type = Column(String(20), nullable=True)
    elimination_value = Column(Float, nullable=True)
    is_frozen = Column(Boolean, default=False)
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


class PersohubClub(Base):
    __tablename__ = "persohub_clubs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), unique=True, nullable=False, index=True)
    club_url = Column(String(500), nullable=True)
    club_logo_url = Column(String(500), nullable=True)
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
