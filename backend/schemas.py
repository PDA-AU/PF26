from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from enum import Enum
import re


class DepartmentEnum(str, Enum):
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


class YearOfStudyEnum(str, Enum):
    FIRST = "First Year"
    SECOND = "Second Year"
    THIRD = "Third Year"


class GenderEnum(str, Enum):
    MALE = "Male"
    FEMALE = "Female"


class UserRoleEnum(str, Enum):
    PARTICIPANT = "participant"
    ADMIN = "admin"


class RoundStateEnum(str, Enum):
    DRAFT = "Draft"
    PUBLISHED = "Published"
    ACTIVE = "Active"
    COMPLETED = "Completed"


class ParticipantStatusEnum(str, Enum):
    ACTIVE = "Active"
    ELIMINATED = "Eliminated"


class RoundModeEnum(str, Enum):
    ONLINE = "Online"
    OFFLINE = "Offline"


# Auth Schemas
class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    register_number: str = Field(..., min_length=10, max_length=10)
    email: EmailStr
    phone: str = Field(..., min_length=10, max_length=10)
    password: str = Field(..., min_length=6)
    gender: GenderEnum
    department: DepartmentEnum
    year_of_study: YearOfStudyEnum
    referral_code: Optional[str] = None
    
    @field_validator('register_number')
    @classmethod
    def validate_register_number(cls, v):
        if not v.isdigit():
            raise ValueError('Register number must contain only digits')
        return v
    
    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        if not v.isdigit():
            raise ValueError('Phone number must contain only digits')
        return v


class UserLogin(BaseModel):
    register_number: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class RefreshTokenRequest(BaseModel):
    refresh_token: str


# User Schemas
class UserResponse(BaseModel):
    id: int
    register_number: str
    email: str
    name: str
    phone: str
    gender: GenderEnum
    department: DepartmentEnum
    year_of_study: YearOfStudyEnum
    role: UserRoleEnum
    referral_code: str
    referred_by: Optional[str] = None
    referral_count: int
    profile_picture: Optional[str] = None
    status: ParticipantStatusEnum
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None


class ParticipantListResponse(BaseModel):
    id: int
    register_number: str
    name: str
    email: str
    profile_picture: Optional[str] = None
    department: DepartmentEnum
    year_of_study: YearOfStudyEnum
    gender: GenderEnum
    status: ParticipantStatusEnum
    referral_count: int
    
    class Config:
        from_attributes = True


# Round Schemas
class EvaluationCriteria(BaseModel):
    name: str
    max_marks: float


class RoundCreate(BaseModel):
    name: str = Field(..., min_length=2)
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    date: Optional[datetime] = None
    mode: RoundModeEnum
    conducted_by: Optional[str] = None
    evaluation_criteria: Optional[List[EvaluationCriteria]] = None


class RoundUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    date: Optional[datetime] = None
    mode: Optional[RoundModeEnum] = None
    conducted_by: Optional[str] = None
    state: Optional[RoundStateEnum] = None
    evaluation_criteria: Optional[List[EvaluationCriteria]] = None
    elimination_type: Optional[str] = None
    elimination_value: Optional[float] = None


class RoundResponse(BaseModel):
    id: int
    round_no: str
    name: str
    description: Optional[str]
    tags: Optional[List[str]]
    date: Optional[datetime]
    mode: RoundModeEnum
    conducted_by: Optional[str]
    state: RoundStateEnum
    evaluation_criteria: Optional[List[Dict[str, Any]]]
    description_pdf: Optional[str] = None
    elimination_type: Optional[str]
    elimination_value: Optional[float]
    is_frozen: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class RoundPublicResponse(BaseModel):
    id: int
    round_no: str
    name: str
    description: Optional[str]
    date: Optional[datetime]
    mode: RoundModeEnum
    description_pdf: Optional[str] = None
    
    class Config:
        from_attributes = True


class RoundStatsTopEntry(BaseModel):
    participant_id: int
    name: str
    register_number: str
    normalized_score: float


class RoundStatsResponse(BaseModel):
    round_id: int
    total_count: int
    present_count: int
    absent_count: int
    min_score: Optional[float]
    max_score: Optional[float]
    avg_score: Optional[float]
    top10: List[RoundStatsTopEntry]


# Score Schemas
class ScoreEntry(BaseModel):
    participant_id: int
    criteria_scores: Dict[str, float]
    is_present: bool = True


class ScoreUpdate(BaseModel):
    criteria_scores: Optional[Dict[str, float]] = None
    is_present: Optional[bool] = None


class ScoreResponse(BaseModel):
    id: int
    participant_id: int
    round_id: int
    criteria_scores: Optional[Dict[str, float]]
    total_score: float
    normalized_score: float
    is_present: bool
    participant_name: Optional[str] = None
    participant_register_number: Optional[str] = None
    
    class Config:
        from_attributes = True


class ParticipantRoundStatus(BaseModel):
    round_no: str
    round_name: str
    status: str  # "Active", "Eliminated", "Pending"
    is_present: Optional[bool] = None


class AdminParticipantRoundStat(BaseModel):
    round_id: int
    round_no: str
    round_name: str
    round_state: RoundStateEnum
    status: str
    is_present: Optional[bool] = None
    total_score: Optional[float] = None
    normalized_score: Optional[float] = None
    round_rank: Optional[int] = None


class ParticipantLeaderboardSummary(BaseModel):
    participant_id: int
    overall_rank: Optional[int] = None
    overall_points: float = 0


# Leaderboard
class LeaderboardEntry(BaseModel):
    rank: int
    participant_id: int
    register_number: str
    name: str
    email: EmailStr
    department: DepartmentEnum
    year_of_study: YearOfStudyEnum
    gender: GenderEnum
    cumulative_score: float
    rounds_participated: int
    status: ParticipantStatusEnum
    referral_count: int
    profile_picture: Optional[str] = None


class AdminLogResponse(BaseModel):
    id: int
    admin_id: int
    admin_register_number: str
    admin_name: str
    action: str
    method: Optional[str] = None
    path: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PdaAdminCreate(BaseModel):
    register_number: str = Field(..., min_length=10, max_length=10)
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=2)
    phone: Optional[str] = None
    gender: Optional[GenderEnum] = None
    department: Optional[DepartmentEnum] = None
    year_of_study: Optional[YearOfStudyEnum] = None


# Dashboard Stats
class DashboardStats(BaseModel):
    total_participants: int
    registration_open: bool
    rounds_completed: int
    current_active_round: Optional[str]
    active_count: int
    eliminated_count: int
    gender_distribution: Dict[str, int]
    department_distribution: Dict[str, int]
    year_distribution: Dict[str, int]


# PDA Home Content
class ProgramCreate(BaseModel):
    title: str = Field(..., min_length=2)
    description: Optional[str] = None
    tag: Optional[str] = None
    poster_url: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    format: Optional[str] = None
    hero_caption: Optional[str] = None
    hero_url: Optional[str] = None
    is_featured: bool = False


class ProgramUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tag: Optional[str] = None
    poster_url: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    format: Optional[str] = None
    hero_caption: Optional[str] = None
    hero_url: Optional[str] = None
    is_featured: Optional[bool] = None


class ProgramResponse(BaseModel):
    id: int
    type: Optional[str] = None
    title: str
    description: Optional[str]
    tag: Optional[str]
    poster_url: Optional[str]
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    format: Optional[str] = None
    hero_caption: Optional[str] = None
    hero_url: Optional[str] = None
    is_featured: bool
    created_at: datetime

    class Config:
        from_attributes = True


class EventCreate(BaseModel):
    title: str = Field(..., min_length=2)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    format: Optional[str] = None
    description: Optional[str] = None
    poster_url: Optional[str] = None
    hero_caption: Optional[str] = None
    hero_url: Optional[str] = None
    is_featured: bool = False


class EventUpdate(BaseModel):
    title: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    format: Optional[str] = None
    description: Optional[str] = None
    poster_url: Optional[str] = None
    hero_caption: Optional[str] = None
    hero_url: Optional[str] = None
    is_featured: Optional[bool] = None


class EventResponse(BaseModel):
    id: int
    type: Optional[str] = None
    title: str
    start_date: Optional[date]
    end_date: Optional[date]
    format: Optional[str]
    description: Optional[str]
    poster_url: Optional[str]
    hero_caption: Optional[str]
    hero_url: Optional[str]
    is_featured: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PdaTeamCreate(BaseModel):
    name: str = Field(..., min_length=2)
    regno: str = Field(..., min_length=6)
    dept: Optional[str] = None
    email: Optional[str] = None
    phno: Optional[str] = None
    team_designation: str = Field(..., min_length=2)
    photo_url: Optional[str] = None
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None


class PdaTeamUpdate(BaseModel):
    name: Optional[str] = None
    regno: Optional[str] = None
    dept: Optional[str] = None
    email: Optional[str] = None
    phno: Optional[str] = None
    team_designation: Optional[str] = None
    photo_url: Optional[str] = None
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None


class PdaTeamResponse(BaseModel):
    id: int
    name: str
    regno: str
    dept: Optional[str]
    email: Optional[str]
    phno: Optional[str]
    team_designation: str
    photo_url: Optional[str]
    instagram_url: Optional[str]
    linkedin_url: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class PdaGalleryCreate(BaseModel):
    photo_url: str = Field(..., min_length=5)
    caption: Optional[str] = None
    order: Optional[int] = 0
    is_featured: bool = False


class PdaGalleryUpdate(BaseModel):
    photo_url: Optional[str] = None
    caption: Optional[str] = None
    order: Optional[int] = None
    is_featured: Optional[bool] = None


class PdaGalleryResponse(BaseModel):
    id: int
    photo_url: str
    caption: Optional[str]
    order: Optional[int]
    is_featured: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Top Referrers
class TopReferrer(BaseModel):
    name: str
    department: DepartmentEnum
    referral_count: int


# Update forward reference
TokenResponse.model_rebuild()
