from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Date, Enum as SQLEnum, ForeignKey, Text, JSON
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


class PdaUser(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    regno = Column(String(20), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    dob = Column(Date, nullable=True)
    gender = Column(String(10), nullable=True)
    phno = Column(String(20), nullable=True)
    dept = Column(String(150), nullable=True)
    image_url = Column(String(500), nullable=True)
    json_content = Column(JSON, nullable=True)
    is_member = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


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
    admin_id = Column(Integer, nullable=True)
    admin_register_number = Column(String(10), nullable=False)
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
    hashed_password = Column(String(255), nullable=False)
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
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    team = Column(String(120), nullable=True)
    designation = Column(String(120), nullable=True)
    instagram_url = Column(String(500), nullable=True)
    linkedin_url = Column(String(500), nullable=True)
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
