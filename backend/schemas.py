from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
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
    
    class Config:
        from_attributes = True


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


# Leaderboard
class LeaderboardEntry(BaseModel):
    rank: int
    participant_id: int
    register_number: str
    name: str
    department: DepartmentEnum
    year_of_study: YearOfStudyEnum
    cumulative_score: float
    rounds_participated: int
    status: ParticipantStatusEnum


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


# Top Referrers
class TopReferrer(BaseModel):
    name: str
    department: DepartmentEnum
    referral_count: int


# Update forward reference
TokenResponse.model_rebuild()
