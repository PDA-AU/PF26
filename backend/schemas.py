from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Any
from enum import Enum
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
    email_verified: bool
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


class EmailVerificationRequest(BaseModel):
    token: str = Field(..., min_length=10)


class ForgotPasswordRequest(BaseModel):
    email: Optional[EmailStr] = None
    register_number: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=6)
    confirm_password: str = Field(..., min_length=6)


class PdaUserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    regno: str = Field(..., min_length=6, max_length=20)
    email: EmailStr
    dob: date
    gender: Optional[str] = None
    phno: Optional[str] = None
    dept: Optional[str] = None
    password: str = Field(..., min_length=6)
    image_url: Optional[str] = None
    preferred_team: Optional[str] = None

    @field_validator('regno')
    @classmethod
    def validate_regno(cls, v):
        if not str(v).strip():
            raise ValueError('Register number is required')
        return v


class PdaUserLogin(BaseModel):
    regno: str
    password: str


class PdaUserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    dob: Optional[date] = None
    gender: Optional[str] = None
    phno: Optional[str] = None
    dept: Optional[str] = None
    image_url: Optional[str] = None
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None


class PdaForgotPasswordRequest(BaseModel):
    email: Optional[EmailStr] = None
    regno: Optional[str] = None


class PdaUserResponse(BaseModel):
    id: int
    regno: str
    email: str
    email_verified: bool
    name: str
    dob: Optional[date] = None
    gender: Optional[str] = None
    phno: Optional[str] = None
    dept: Optional[str] = None
    image_url: Optional[str] = None
    is_member: bool
    preferred_team: Optional[str] = None
    team: Optional[str] = None
    designation: Optional[str] = None
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    is_admin: bool = False
    is_superadmin: bool = False
    policy: Optional[Dict[str, bool]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PdaPasswordChangeRequest(BaseModel):
    old_password: str = Field(..., min_length=6)
    new_password: str = Field(..., min_length=6)
    confirm_password: str = Field(..., min_length=6)


class PdaPasswordChangeResponse(BaseModel):
    status: str


class PresignRequest(BaseModel):
    filename: str = Field(..., min_length=1)
    content_type: str = Field(..., min_length=1)


class PresignResponse(BaseModel):
    upload_url: str
    public_url: str
    key: str
    content_type: str


class ImageUrlUpdate(BaseModel):
    image_url: str = Field(..., min_length=5)


class ProfilePictureUpdate(BaseModel):
    profile_picture: str = Field(..., min_length=5)


class PdaTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: PdaUserResponse


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
    eliminate_absent: Optional[bool] = None


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
    participant_status: Optional[ParticipantStatusEnum] = None
    
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
    rank: Optional[int] = None
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
    user_id: int = Field(..., ge=1)


class PdaAdminPolicyUpdate(BaseModel):
    policy: Dict[str, bool]


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
    leaderboard_min_score: Optional[float] = None
    leaderboard_max_score: Optional[float] = None
    leaderboard_avg_score: Optional[float] = None
    round_min_score: Optional[float] = None
    round_max_score: Optional[float] = None
    round_avg_score: Optional[float] = None


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
    featured_poster_url: Optional[str] = None
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
    featured_poster_url: Optional[str] = None
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
    featured_poster_url: Optional[str] = None
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
    featured_poster_url: Optional[str] = None
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
    featured_poster_url: Optional[str] = None
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
    featured_poster_url: Optional[str]
    is_featured: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PdaTeamName(str, Enum):
    EXECUTIVE = "Executive"
    CONTENT_CREATION = "Content Creation"
    EVENT_MANAGEMENT = "Event Management"
    DESIGN = "Design"
    WEBSITE_DESIGN = "Website Design"
    PUBLIC_RELATIONS = "Public Relations"
    PODCAST = "Podcast"
    LIBRARY = "Library"


class PdaTeamDesignation(str, Enum):
    ROOT = "Root"
    CHAIRPERSON = "Chairperson"
    VICE_CHAIRPERSON = "Vice Chairperson"
    TREASURER = "Treasurer"
    GENERAL_SECRETARY = "General Secretary"
    HEAD = "Head"
    JS = "JS"
    MEMBER = "Member"
    VOLUNTEER = "Volunteer"


class PdaTeamCreate(BaseModel):
    user_id: Optional[int] = None
    regno: Optional[str] = None
    name: Optional[str] = None
    dept: Optional[str] = None
    email: Optional[str] = None
    phno: Optional[str] = None
    team: Optional["PdaTeamName"] = None
    designation: Optional["PdaTeamDesignation"] = None
    photo_url: Optional[str] = None
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None


class PdaTeamUpdate(BaseModel):
    user_id: Optional[int] = None
    regno: Optional[str] = None
    name: Optional[str] = None
    dept: Optional[str] = None
    email: Optional[str] = None
    phno: Optional[str] = None
    dob: Optional[date] = None
    team: Optional["PdaTeamName"] = None
    designation: Optional["PdaTeamDesignation"] = None
    photo_url: Optional[str] = None
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None


class PdaTeamResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    name: Optional[str] = None
    regno: Optional[str] = None
    dept: Optional[str] = None
    email: Optional[str] = None
    phno: Optional[str] = None
    dob: Optional[date] = None
    team: Optional["PdaTeamName"] = None
    designation: Optional["PdaTeamDesignation"] = None
    photo_url: Optional[str] = None
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PdaGalleryCreate(BaseModel):
    photo_url: str = Field(..., min_length=5)
    caption: Optional[str] = None
    tag: Optional[str] = None
    order: Optional[int] = 0
    is_featured: bool = False


class PdaGalleryUpdate(BaseModel):
    photo_url: Optional[str] = None
    caption: Optional[str] = None
    tag: Optional[str] = None
    order: Optional[int] = None
    is_featured: Optional[bool] = None


class PdaGalleryResponse(BaseModel):
    id: int
    photo_url: str
    caption: Optional[str]
    tag: Optional[str]
    order: Optional[int]
    is_featured: bool
    created_at: datetime

    class Config:
        from_attributes = True


class RecruitmentApprovalItem(BaseModel):
    id: int
    team: Optional["PdaTeamName"] = None
    designation: Optional["PdaTeamDesignation"] = None


# Top Referrers
class TopReferrer(BaseModel):
    name: str
    register_number: Optional[str] = None
    department: Optional[DepartmentEnum] = None
    referral_count: int


# Update forward reference
TokenResponse.model_rebuild()
