from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Enum as SQLEnum, ForeignKey, Text, JSON
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


class User(Base):
    __tablename__ = "users"
    
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
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    scores = relationship("Score", back_populates="participant")


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
    elimination_type = Column(String(20), nullable=True)  # "top_k" or "min_score"
    elimination_value = Column(Float, nullable=True)  # K value or minimum score
    is_frozen = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    scores = relationship("Score", back_populates="round")


class Score(Base):
    __tablename__ = "scores"
    
    id = Column(Integer, primary_key=True, index=True)
    participant_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    round_id = Column(Integer, ForeignKey("rounds.id"), nullable=False)
    criteria_scores = Column(JSON, nullable=True)  # {"Creativity": 20, "Aptitude": 25, ...}
    total_score = Column(Float, default=0)
    normalized_score = Column(Float, default=0)  # Normalized to 100
    is_present = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    participant = relationship("User", back_populates="scores")
    round = relationship("Round", back_populates="scores")


class SystemConfig(Base):
    __tablename__ = "system_config"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(String(500), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
