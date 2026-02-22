from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime, date
from enum import Enum
import json
import re
from urllib.parse import urlparse


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


PROFILE_ID_SLUG_RE = re.compile(r"^[a-z0-9-]{3,64}$")


def _normalize_optional_http_url(value: Optional[str], field_name: str, max_length: int = 500) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw:
        return None
    if len(raw) > max_length:
        raise ValueError(f"{field_name} must be at most {max_length} characters")
    parsed = urlparse(raw)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"{field_name} must be a valid http/https URL")
    return raw


def _normalize_optional_logo_url(value: Optional[str], field_name: str, max_length: int = 500) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw:
        return None
    if raw.startswith("/"):
        if len(raw) > max_length:
            raise ValueError(f"{field_name} must be at most {max_length} characters")
        return raw
    return _normalize_optional_http_url(raw, field_name, max_length=max_length)


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
    profile_name: Optional[str] = None
    regno: str = Field(..., min_length=6, max_length=20)
    email: EmailStr
    dob: date
    gender: Optional[GenderEnum] = None
    phno: Optional[str] = None
    dept: Optional[str] = None
    college: Optional[str] = "MIT"
    password: str = Field(..., min_length=6)
    image_url: Optional[str] = None
    preferred_team: Optional[str] = None

    @field_validator('regno')
    @classmethod
    def validate_regno(cls, v):
        if not str(v).strip():
            raise ValueError('Register number is required')
        return v

    @field_validator("profile_name")
    @classmethod
    def validate_profile_name(cls, v):
        if v is None:
            return v
        if not re.fullmatch(r"[a-z0-9_]{3,40}", v):
            raise ValueError("profile_name must match [a-z0-9_] and be 3-40 chars")
        return v

    @field_validator("gender", "dept", mode="before")
    @classmethod
    def normalize_optional_profile_enum_fields(cls, v):
        if v is None:
            return None
        value = str(v).strip()
        return value or None

    @field_validator("college", mode="before")
    @classmethod
    def normalize_college(cls, v):
        value = str(v or "").strip()
        return value or "MIT"


class PdaRecruitmentApplyRequest(BaseModel):
    preferred_team_1: str = Field(..., min_length=2, max_length=64)
    preferred_team_2: Optional[str] = Field(default=None, min_length=2, max_length=64)
    preferred_team_3: Optional[str] = Field(default=None, min_length=2, max_length=64)
    resume_url: Optional[str] = Field(default=None, max_length=800)

    @field_validator("preferred_team_1", "preferred_team_2", "preferred_team_3", "resume_url")
    @classmethod
    def validate_optional_trimmed_value(cls, v):
        if v is None:
            return None
        value = str(v or "").strip()
        return value or None

    @model_validator(mode="after")
    def validate_team_preferences(self):
        if not self.preferred_team_1:
            raise ValueError("preferred_team_1 is required")
        prefs = [self.preferred_team_1, self.preferred_team_2, self.preferred_team_3]
        filtered = [pref for pref in prefs if pref]
        if any(pref == "Executive" for pref in filtered):
            raise ValueError("Executive team cannot be selected")
        if len(filtered) != len(set(filtered)):
            raise ValueError("Team preferences must be unique")
        return self


class PdaRecruitmentResumeUpdateRequest(BaseModel):
    resume_url: Optional[str] = Field(default=None, max_length=800)
    remove: bool = False

    @field_validator("resume_url")
    @classmethod
    def validate_optional_trimmed_resume(cls, v):
        if v is None:
            return None
        value = str(v or "").strip()
        return value or None


class PdaRecruitmentConfigUpdateRequest(BaseModel):
    recruit_url: Optional[str] = Field(default=None, max_length=800)

    @field_validator("recruit_url")
    @classmethod
    def validate_optional_trimmed_recruit_url(cls, v):
        if v is None:
            return None
        value = str(v or "").strip()
        return value or None


class PdaUserLogin(BaseModel):
    regno: str
    password: str


class PdaUserUpdate(BaseModel):
    name: Optional[str] = None
    profile_name: Optional[str] = None
    email: Optional[EmailStr] = None
    dob: Optional[date] = None
    gender: Optional[GenderEnum] = None
    phno: Optional[str] = None
    dept: Optional[str] = None
    college: Optional[str] = None
    image_url: Optional[str] = None
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None

    @field_validator("profile_name")
    @classmethod
    def validate_profile_name(cls, v):
        if v is None:
            return v
        if not re.fullmatch(r"[a-z0-9_]{3,40}", v):
            raise ValueError("profile_name must match [a-z0-9_] and be 3-40 chars")
        return v

    @field_validator("gender", "dept", mode="before")
    @classmethod
    def normalize_optional_profile_fields(cls, v):
        if v is None:
            return None
        value = str(v).strip()
        return value or None

    @field_validator("college", mode="before")
    @classmethod
    def normalize_optional_college(cls, v):
        if v is None:
            return None
        value = str(v or "").strip()
        return value or "MIT"


class PdaForgotPasswordRequest(BaseModel):
    email: Optional[EmailStr] = None
    regno: Optional[str] = None


class PdaUserResponse(BaseModel):
    id: int
    regno: str
    email: str
    email_verified: bool
    name: str
    profile_name: Optional[str] = None
    dob: Optional[date] = None
    gender: Optional[GenderEnum] = None
    phno: Optional[str] = None
    dept: Optional[str] = None
    college: str = "MIT"
    image_url: Optional[str] = None
    is_member: bool
    is_applied: bool = False
    preferred_team: Optional[str] = None
    preferred_team_1: Optional[str] = None
    preferred_team_2: Optional[str] = None
    preferred_team_3: Optional[str] = None
    resume_url: Optional[str] = None
    team: Optional[str] = None
    designation: Optional[str] = None
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    is_admin: bool = False
    is_superadmin: bool = False
    policy: Optional[Dict[str, Any]] = None
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


class PdaPdfPreviewGenerateRequest(BaseModel):
    s3_url: str = Field(..., min_length=5)
    max_pages: int = Field(default=20, ge=1, le=20)


class PdaPdfPreviewGenerateResponse(BaseModel):
    preview_image_urls: List[str] = Field(default_factory=list)
    pages_generated: int = 0


class ImageUrlUpdate(BaseModel):
    image_url: str = Field(..., min_length=5)


class ProfilePictureUpdate(BaseModel):
    profile_picture: str = Field(..., min_length=5)


class PdaTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: PdaUserResponse
    password_reset_required: Optional[bool] = None
    reset_token: Optional[str] = None


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


class SuperadminMigrationStatusResponse(BaseModel):
    status_key: str
    recorded: bool
    ok: Optional[bool] = None
    old_remaining: Optional[int] = None
    new_missing: Optional[int] = None
    legacy_sympo: Optional[bool] = None
    updated_at: Optional[datetime] = None
    logged_once: bool
    raw_value: Optional[str] = None


class PdaEventLogResponse(BaseModel):
    id: int
    event_id: Optional[int] = None
    event_slug: str
    admin_id: Optional[int] = None
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
    policy: Dict[str, Any]


class CcClubCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=120)
    profile_id: str = Field(..., min_length=3, max_length=64)
    club_url: Optional[str] = Field(default=None, max_length=500)
    club_logo_url: Optional[str] = Field(default=None, max_length=500)
    club_tagline: Optional[str] = Field(default=None, max_length=255)
    club_description: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        normalized = str(value or "").strip()
        if not normalized:
            raise ValueError("name cannot be empty")
        return normalized

    @field_validator("profile_id", mode="before")
    @classmethod
    def normalize_profile_id(cls, value):
        normalized = str(value or "").strip().lower()
        if not PROFILE_ID_SLUG_RE.fullmatch(normalized):
            raise ValueError("profile_id must match [a-z0-9-]{3,64}")
        return normalized

    @field_validator("club_url", mode="before")
    @classmethod
    def normalize_club_url(cls, value):
        return _normalize_optional_http_url(value, "club_url")

    @field_validator("club_logo_url", mode="before")
    @classmethod
    def normalize_logo(cls, value):
        return _normalize_optional_logo_url(value, "club_logo_url")

    @field_validator("club_tagline", "club_description", mode="before")
    @classmethod
    def normalize_optional_text(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None


class CcClubUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    profile_id: Optional[str] = Field(default=None, min_length=3, max_length=64)
    club_url: Optional[str] = Field(default=None, max_length=500)
    club_logo_url: Optional[str] = Field(default=None, max_length=500)
    club_tagline: Optional[str] = Field(default=None, max_length=255)
    club_description: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        if not normalized:
            raise ValueError("name cannot be empty")
        return normalized

    @field_validator("profile_id", mode="before")
    @classmethod
    def normalize_profile_id(cls, value):
        if value is None:
            return None
        normalized = str(value).strip().lower()
        if not PROFILE_ID_SLUG_RE.fullmatch(normalized):
            raise ValueError("profile_id must match [a-z0-9-]{3,64}")
        return normalized

    @field_validator("club_url", mode="before")
    @classmethod
    def normalize_club_url(cls, value):
        return _normalize_optional_http_url(value, "club_url")

    @field_validator("club_logo_url", mode="before")
    @classmethod
    def normalize_logo(cls, value):
        return _normalize_optional_logo_url(value, "club_logo_url")

    @field_validator("club_tagline", "club_description", mode="before")
    @classmethod
    def normalize_optional_text(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None


class CcClubResponse(BaseModel):
    id: int
    name: str
    profile_id: str
    club_url: Optional[str] = None
    club_logo_url: Optional[str] = None
    club_tagline: Optional[str] = None
    club_description: Optional[str] = None
    linked_community_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CcCommunityCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=120)
    profile_id: str = Field(..., min_length=3, max_length=64)
    club_id: Optional[int] = Field(default=None, ge=1)
    admin_id: int = Field(..., ge=1)
    password: str = Field(..., min_length=8)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    is_active: bool = True
    is_root: bool = False

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        normalized = str(value or "").strip()
        if not normalized:
            raise ValueError("name cannot be empty")
        return normalized

    @field_validator("profile_id", mode="before")
    @classmethod
    def normalize_profile_id(cls, value):
        normalized = str(value or "").strip().lower()
        if not PROFILE_ID_SLUG_RE.fullmatch(normalized):
            raise ValueError("profile_id must match [a-z0-9-]{3,64}")
        return normalized

    @field_validator("logo_url", mode="before")
    @classmethod
    def normalize_logo(cls, value):
        return _normalize_optional_logo_url(value, "logo_url")

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None


class CcCommunityUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    club_id: Optional[int] = Field(default=None, ge=1)
    admin_id: Optional[int] = Field(default=None, ge=1)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    is_active: Optional[bool] = None
    is_root: Optional[bool] = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        if not normalized:
            raise ValueError("name cannot be empty")
        return normalized

    @field_validator("logo_url", mode="before")
    @classmethod
    def normalize_logo(cls, value):
        return _normalize_optional_logo_url(value, "logo_url")

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None


class CcCommunityResetPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    new_password: str = Field(..., min_length=8)


class CcCommunityResponse(BaseModel):
    id: int
    name: str
    profile_id: str
    club_id: Optional[int] = None
    club_name: Optional[str] = None
    admin_id: int
    admin_name: Optional[str] = None
    admin_regno: Optional[str] = None
    logo_url: Optional[str] = None
    description: Optional[str] = None
    is_active: bool
    is_root: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CcSympoCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=255)
    organising_club_id: int = Field(..., ge=1)
    event_ids: List[int] = Field(default_factory=list)
    content: Optional[Dict[str, Any]] = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        normalized = str(value or "").strip()
        if not normalized:
            raise ValueError("name cannot be empty")
        return normalized

    @field_validator("event_ids")
    @classmethod
    def normalize_event_ids(cls, values):
        if values is None:
            return []
        deduped = []
        seen = set()
        for raw in values:
            value = int(raw)
            if value <= 0 or value in seen:
                continue
            seen.add(value)
            deduped.append(value)
        return deduped


class CcSympoUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    organising_club_id: Optional[int] = Field(default=None, ge=1)
    event_ids: Optional[List[int]] = None
    content: Optional[Dict[str, Any]] = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        if not normalized:
            raise ValueError("name cannot be empty")
        return normalized

    @field_validator("event_ids")
    @classmethod
    def normalize_event_ids(cls, values):
        if values is None:
            return None
        deduped = []
        seen = set()
        for raw in values:
            value = int(raw)
            if value <= 0 or value in seen:
                continue
            seen.add(value)
            deduped.append(value)
        return deduped


class CcSympoResponse(BaseModel):
    id: int
    name: str
    organising_club_id: int
    organising_club_name: Optional[str] = None
    content: Optional[Dict[str, Any]] = None
    event_ids: List[int] = Field(default_factory=list)
    event_titles: List[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CcDeleteSummaryResponse(BaseModel):
    message: str
    deleted_counts: Dict[str, int] = Field(default_factory=dict)


class CcAdminUserOption(BaseModel):
    id: int
    regno: str
    name: str


class CcPersohubEventOption(BaseModel):
    id: int
    slug: str
    event_code: str
    title: str
    community_id: int
    community_name: str
    sympo_id: Optional[int] = None
    sympo_name: Optional[str] = None


class CcPersohubEventSympoAssignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sympo_id: Optional[int] = Field(default=None, ge=1)


class CcPersohubEventSympoAssignResponse(BaseModel):
    event_id: int
    sympo_id: Optional[int] = None
    sympo_name: Optional[str] = None
    message: str


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
    profile_name: Optional[str] = None
    dept: Optional[str] = None
    college: Optional[str] = "MIT"
    email: Optional[str] = None
    dob: Optional[date] = None
    gender: Optional[GenderEnum] = None
    phno: Optional[str] = None
    password: Optional[str] = None
    team: Optional["PdaTeamName"] = None
    designation: Optional["PdaTeamDesignation"] = None
    photo_url: Optional[str] = None
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None

    @field_validator("dept", "gender", mode="before")
    @classmethod
    def normalize_optional_team_dept(cls, v):
        if v is None:
            return None
        value = str(v).strip()
        return value or None

    @field_validator("college", mode="before")
    @classmethod
    def normalize_team_college(cls, v):
        value = str(v or "").strip()
        return value or "MIT"


class PdaTeamUpdate(BaseModel):
    user_id: Optional[int] = None
    regno: Optional[str] = None
    name: Optional[str] = None
    dept: Optional[str] = None
    college: Optional[str] = None
    email: Optional[str] = None
    phno: Optional[str] = None
    dob: Optional[date] = None
    team: Optional["PdaTeamName"] = None
    designation: Optional["PdaTeamDesignation"] = None
    photo_url: Optional[str] = None
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None

    @field_validator("dept", mode="before")
    @classmethod
    def normalize_optional_team_dept(cls, v):
        if v is None:
            return None
        value = str(v).strip()
        return value or None

    @field_validator("college", mode="before")
    @classmethod
    def normalize_optional_team_college(cls, v):
        if v is None:
            return None
        value = str(v or "").strip()
        return value or "MIT"


class PdaTeamResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    name: Optional[str] = None
    profile_name: Optional[str] = None
    regno: Optional[str] = None
    dept: Optional[str] = None
    college: Optional[str] = None
    email: Optional[str] = None
    phno: Optional[str] = None
    dob: Optional[date] = None
    resume_url: Optional[str] = None
    team: Optional["PdaTeamName"] = None
    designation: Optional["PdaTeamDesignation"] = None
    photo_url: Optional[str] = None
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PdaAdminUserResponse(BaseModel):
    id: int
    team_member_id: Optional[int] = None
    name: str
    profile_name: Optional[str] = None
    regno: str
    dept: Optional[str] = None
    college: Optional[str] = None
    email: str
    phno: Optional[str] = None
    dob: Optional[date] = None
    gender: Optional[str] = None
    is_member: bool = False
    is_applied: bool = False
    preferred_team: Optional[str] = None
    preferred_team_1: Optional[str] = None
    preferred_team_2: Optional[str] = None
    preferred_team_3: Optional[str] = None
    resume_url: Optional[str] = None
    email_verified: bool = False
    team: Optional["PdaTeamName"] = None
    designation: Optional["PdaTeamDesignation"] = None
    photo_url: Optional[str] = None
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PdaAdminUserUpdate(BaseModel):
    name: Optional[str] = None
    profile_name: Optional[str] = None
    email: Optional[str] = None
    phno: Optional[str] = None
    dept: Optional[str] = None
    college: Optional[str] = None
    dob: Optional[date] = None
    gender: Optional[GenderEnum] = None
    is_member: Optional[bool] = None
    team: Optional["PdaTeamName"] = None
    designation: Optional["PdaTeamDesignation"] = None
    photo_url: Optional[str] = None
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    clear_team: Optional[bool] = None

    @field_validator("dept", "gender", mode="before")
    @classmethod
    def normalize_optional_admin_profile_fields(cls, v):
        if v is None:
            return None
        value = str(v).strip()
        return value or None

    @field_validator("college", mode="before")
    @classmethod
    def normalize_optional_admin_college(cls, v):
        if v is None:
            return None
        value = str(v or "").strip()
        return value or "MIT"


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


# PDA Managed Event Engine
class PdaManagedEventTypeEnum(str, Enum):
    SESSION = "Session"
    WORKSHOP = "Workshop"
    EVENT = "Event"


class PdaManagedEventFormatEnum(str, Enum):
    ONLINE = "Online"
    OFFLINE = "Offline"
    HYBRID = "Hybrid"


class PdaManagedEventTemplateEnum(str, Enum):
    ATTENDANCE_ONLY = "attendance_only"
    ATTENDANCE_SCORING = "attendance_scoring"


class PdaManagedParticipantModeEnum(str, Enum):
    INDIVIDUAL = "individual"
    TEAM = "team"


class PdaManagedRoundModeEnum(str, Enum):
    SINGLE = "single"
    MULTI = "multi"


class PdaManagedEventStatusEnum(str, Enum):
    OPEN = "open"
    CLOSED = "closed"


class PdaManagedEventOpenForEnum(str, Enum):
    MIT = "MIT"
    ALL = "ALL"


class PdaManagedEntityTypeEnum(str, Enum):
    USER = "user"
    TEAM = "team"


class PdaManagedRoundStateEnum(str, Enum):
    DRAFT = "Draft"
    PUBLISHED = "Published"
    ACTIVE = "Active"
    COMPLETED = "Completed"
    REVEAL = "Reveal"


class PdaManagedRoundSubmissionModeEnum(str, Enum):
    FILE_OR_LINK = "file_or_link"


class PdaManagedRoundSubmissionTypeEnum(str, Enum):
    FILE = "file"
    LINK = "link"


class PdaManagedBadgePlaceEnum(str, Enum):
    WINNER = "Winner"
    RUNNER = "Runner"
    SPECIAL_MENTION = "SpecialMention"


class PdaManagedPanelTeamDistributionModeEnum(str, Enum):
    TEAM_COUNT = "team_count"
    MEMBER_COUNT_WEIGHTED = "member_count_weighted"


def _normalize_optional_http_url(value: Optional[str], field_name: str) -> Optional[str]:
    if value is None:
        return None
    cleaned = str(value).strip()
    if not cleaned:
        return None
    lowered = cleaned.lower()
    if not (lowered.startswith("http://") or lowered.startswith("https://")):
        raise ValueError(f"{field_name} must start with http:// or https://")
    return cleaned


def _normalize_optional_http_url_or_assets_json(value: Optional[str], field_name: str) -> Optional[str]:
    if value is None:
        return None
    cleaned = str(value).strip()
    if not cleaned:
        return None
    if cleaned.startswith("["):
        try:
            parsed = json.loads(cleaned)
        except Exception as exc:
            raise ValueError(f"{field_name} must be a valid JSON array") from exc
        if not isinstance(parsed, list):
            raise ValueError(f"{field_name} must be a JSON array")
        normalized_assets: List[Dict[str, str]] = []
        for index, asset in enumerate(parsed):
            if not isinstance(asset, dict):
                raise ValueError(f"{field_name}[{index}] must be an object")
            raw_url = str(asset.get("url") or asset.get("src") or "").strip()
            if not raw_url:
                raise ValueError(f"{field_name}[{index}].url is required")
            normalized_url = _normalize_optional_http_url(raw_url, f"{field_name}[{index}].url")
            normalized_asset: Dict[str, str] = {"url": normalized_url}
            ratio = str(asset.get("aspect_ratio") or asset.get("ratio") or "").strip()
            if ratio:
                normalized_asset["aspect_ratio"] = ratio
            normalized_assets.append(normalized_asset)
        return json.dumps(normalized_assets, separators=(",", ":"))
    return _normalize_optional_http_url(cleaned, field_name)


class PdaManagedEventCreate(BaseModel):
    title: str = Field(..., min_length=2)
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    poster_url: Optional[str] = None
    whatsapp_url: Optional[str] = None
    external_url_name: Optional[str] = "Join whatsapp channel"
    event_type: PdaManagedEventTypeEnum
    format: PdaManagedEventFormatEnum
    template_option: PdaManagedEventTemplateEnum
    participant_mode: PdaManagedParticipantModeEnum
    round_mode: PdaManagedRoundModeEnum
    round_count: int = Field(1, ge=1, le=20)
    team_min_size: Optional[int] = Field(None, ge=1, le=100)
    team_max_size: Optional[int] = Field(None, ge=1, le=100)
    club_id: int = Field(1, ge=1)
    open_for: PdaManagedEventOpenForEnum = PdaManagedEventOpenForEnum.MIT

    @field_validator("whatsapp_url", mode="before")
    @classmethod
    def validate_whatsapp_url(cls, value):
        return _normalize_optional_http_url(value, "whatsapp_url")


class PdaManagedEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    poster_url: Optional[str] = None
    whatsapp_url: Optional[str] = None
    external_url_name: Optional[str] = None
    event_type: Optional[PdaManagedEventTypeEnum] = None
    format: Optional[PdaManagedEventFormatEnum] = None
    template_option: Optional[PdaManagedEventTemplateEnum] = None
    participant_mode: Optional[PdaManagedParticipantModeEnum] = None
    round_mode: Optional[PdaManagedRoundModeEnum] = None
    round_count: Optional[int] = Field(None, ge=1, le=20)
    team_min_size: Optional[int] = Field(None, ge=1, le=100)
    team_max_size: Optional[int] = Field(None, ge=1, le=100)
    is_visible: Optional[bool] = None
    status: Optional[PdaManagedEventStatusEnum] = None
    open_for: Optional[PdaManagedEventOpenForEnum] = None

    @field_validator("whatsapp_url", mode="before")
    @classmethod
    def validate_whatsapp_url(cls, value):
        return _normalize_optional_http_url(value, "whatsapp_url")


class PdaManagedEventStatusUpdate(BaseModel):
    status: PdaManagedEventStatusEnum


class PdaManagedEventVisibilityUpdate(BaseModel):
    is_visible: bool


class PdaManagedEventRegistrationUpdate(BaseModel):
    registration_open: bool


class PdaManagedEventResponse(BaseModel):
    id: int
    slug: str
    event_code: str
    club_id: int
    title: str
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    poster_url: Optional[str] = None
    whatsapp_url: Optional[str] = None
    external_url_name: Optional[str] = "Join whatsapp channel"
    event_type: PdaManagedEventTypeEnum
    format: PdaManagedEventFormatEnum
    template_option: PdaManagedEventTemplateEnum
    participant_mode: PdaManagedParticipantModeEnum
    round_mode: PdaManagedRoundModeEnum
    round_count: int
    team_min_size: Optional[int] = None
    team_max_size: Optional[int] = None
    is_visible: bool = True
    registration_open: bool = True
    open_for: PdaManagedEventOpenForEnum = PdaManagedEventOpenForEnum.MIT
    status: PdaManagedEventStatusEnum
    created_at: datetime

    class Config:
        from_attributes = True


class PdaManagedEventDashboard(BaseModel):
    event: PdaManagedEventResponse
    is_registered: bool = False
    entity_type: Optional[PdaManagedEntityTypeEnum] = None
    entity_id: Optional[int] = None
    team_code: Optional[str] = None
    team_name: Optional[str] = None
    team_members: List[Dict[str, Any]] = Field(default_factory=list)
    rounds_count: int = 0
    badges_count: int = 0


class PdaManagedTeamCreate(BaseModel):
    team_name: str = Field(..., min_length=2, max_length=255)


class PdaManagedTeamJoin(BaseModel):
    team_code: str = Field(..., min_length=5, max_length=5)


class PdaManagedTeamInvite(BaseModel):
    regno: str = Field(..., min_length=1, max_length=20)


class PdaManagedTeamMemberResponse(BaseModel):
    user_id: int
    regno: str
    name: str
    role: str


class PdaManagedTeamResponse(BaseModel):
    id: int
    event_id: int
    team_code: str
    team_name: str
    team_lead_user_id: int
    members: List[PdaManagedTeamMemberResponse] = Field(default_factory=list)


class PdaManagedRoundCriteria(BaseModel):
    name: str
    max_marks: float


class PdaManagedRoundCreate(BaseModel):
    round_no: int = Field(..., ge=1, le=20)
    name: str = Field(..., min_length=2)
    description: Optional[str] = None
    round_poster: Optional[str] = None
    external_url: Optional[str] = None
    external_url_name: Optional[str] = "Explore Round"
    whatsapp_url: Optional[str] = None
    date: Optional[datetime] = None
    mode: PdaManagedEventFormatEnum = PdaManagedEventFormatEnum.OFFLINE
    evaluation_criteria: Optional[List[PdaManagedRoundCriteria]] = None
    requires_submission: bool = False
    submission_mode: PdaManagedRoundSubmissionModeEnum = PdaManagedRoundSubmissionModeEnum.FILE_OR_LINK
    submission_deadline: Optional[datetime] = None
    allowed_mime_types: List[str] = Field(
        default_factory=lambda: [
            "application/pdf",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "image/png",
            "image/jpeg",
            "image/webp",
            "video/mp4",
            "video/quicktime",
            "application/zip",
        ]
    )
    max_file_size_mb: int = Field(default=25, ge=1, le=500)
    panel_mode_enabled: bool = False
    panel_team_distribution_mode: PdaManagedPanelTeamDistributionModeEnum = PdaManagedPanelTeamDistributionModeEnum.TEAM_COUNT
    panel_structure_locked: bool = False

    @model_validator(mode="before")
    @classmethod
    def map_legacy_whatsapp_url(cls, values):
        if not isinstance(values, dict):
            return values
        if "external_url" not in values and values.get("whatsapp_url") is not None:
            values["external_url"] = values.get("whatsapp_url")
        return values

    @field_validator("external_url", mode="before")
    @classmethod
    def validate_external_url(cls, value):
        return _normalize_optional_http_url(value, "external_url")

    @field_validator("round_poster", mode="before")
    @classmethod
    def validate_round_poster(cls, value):
        return _normalize_optional_http_url_or_assets_json(value, "round_poster")


class PdaManagedRoundUpdate(BaseModel):
    round_no: Optional[int] = Field(None, ge=1, le=20)
    name: Optional[str] = None
    description: Optional[str] = None
    round_poster: Optional[str] = None
    external_url: Optional[str] = None
    external_url_name: Optional[str] = None
    whatsapp_url: Optional[str] = None
    date: Optional[datetime] = None
    mode: Optional[PdaManagedEventFormatEnum] = None
    state: Optional[PdaManagedRoundStateEnum] = None
    evaluation_criteria: Optional[List[PdaManagedRoundCriteria]] = None
    elimination_type: Optional[str] = None
    elimination_value: Optional[float] = None
    eliminate_absent: Optional[bool] = None
    requires_submission: Optional[bool] = None
    submission_mode: Optional[PdaManagedRoundSubmissionModeEnum] = None
    submission_deadline: Optional[datetime] = None
    allowed_mime_types: Optional[List[str]] = None
    max_file_size_mb: Optional[int] = Field(default=None, ge=1, le=500)
    panel_mode_enabled: Optional[bool] = None
    panel_team_distribution_mode: Optional[PdaManagedPanelTeamDistributionModeEnum] = None
    panel_structure_locked: Optional[bool] = None

    @model_validator(mode="before")
    @classmethod
    def map_legacy_whatsapp_url(cls, values):
        if not isinstance(values, dict):
            return values
        if "external_url" not in values and values.get("whatsapp_url") is not None:
            values["external_url"] = values.get("whatsapp_url")
        return values

    @field_validator("external_url", mode="before")
    @classmethod
    def validate_external_url(cls, value):
        return _normalize_optional_http_url(value, "external_url")

    @field_validator("round_poster", mode="before")
    @classmethod
    def validate_round_poster(cls, value):
        return _normalize_optional_http_url_or_assets_json(value, "round_poster")


class PdaManagedRoundResponse(BaseModel):
    id: int
    event_id: int
    round_no: int
    name: str
    description: Optional[str] = None
    round_poster: Optional[str] = None
    external_url: Optional[str] = None
    external_url_name: Optional[str] = "Explore Round"
    date: Optional[datetime] = None
    mode: PdaManagedEventFormatEnum
    state: PdaManagedRoundStateEnum
    evaluation_criteria: Optional[List[Dict[str, Any]]] = None
    elimination_type: Optional[str] = None
    elimination_value: Optional[float] = None
    requires_submission: bool = False
    submission_mode: PdaManagedRoundSubmissionModeEnum = PdaManagedRoundSubmissionModeEnum.FILE_OR_LINK
    submission_deadline: Optional[datetime] = None
    allowed_mime_types: Optional[List[str]] = Field(default_factory=list)
    max_file_size_mb: int = 25
    panel_mode_enabled: bool = False
    panel_team_distribution_mode: PdaManagedPanelTeamDistributionModeEnum = PdaManagedPanelTeamDistributionModeEnum.TEAM_COUNT
    panel_structure_locked: bool = False
    is_frozen: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PdaEventPublicRoundResponse(BaseModel):
    id: int
    event_id: int
    round_no: int
    name: str
    description: Optional[str] = None
    round_poster: Optional[str] = None
    external_url: Optional[str] = None
    external_url_name: Optional[str] = "Explore Round"
    date: Optional[datetime] = None
    mode: PdaManagedEventFormatEnum
    state: PdaManagedRoundStateEnum
    requires_submission: bool = False
    submission_mode: PdaManagedRoundSubmissionModeEnum = PdaManagedRoundSubmissionModeEnum.FILE_OR_LINK
    submission_deadline: Optional[datetime] = None
    allowed_mime_types: Optional[List[str]] = Field(default_factory=list)
    max_file_size_mb: int = 25

    class Config:
        from_attributes = True


class PdaRoundSubmissionPresignRequest(BaseModel):
    filename: str = Field(..., min_length=1)
    content_type: str = Field(..., min_length=1)
    file_size_bytes: int = Field(..., ge=1)


class PdaRoundSubmissionUpsertRequest(BaseModel):
    submission_type: PdaManagedRoundSubmissionTypeEnum
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size_bytes: Optional[int] = Field(default=None, ge=1)
    mime_type: Optional[str] = None
    link_url: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("file_url", "link_url", mode="before")
    @classmethod
    def normalize_optional_url(cls, value):
        return _normalize_optional_http_url(value, "url")


class PdaRoundSubmissionAdminUpdate(BaseModel):
    submission_type: Optional[PdaManagedRoundSubmissionTypeEnum] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size_bytes: Optional[int] = Field(default=None, ge=1)
    mime_type: Optional[str] = None
    link_url: Optional[str] = None
    notes: Optional[str] = None
    is_locked: Optional[bool] = None

    @field_validator("file_url", "link_url", mode="before")
    @classmethod
    def normalize_optional_url(cls, value):
        return _normalize_optional_http_url(value, "url")


class PdaRoundSubmissionResponse(BaseModel):
    id: Optional[int] = None
    event_id: int
    round_id: int
    entity_type: PdaManagedEntityTypeEnum
    user_id: Optional[int] = None
    team_id: Optional[int] = None
    submission_type: Optional[PdaManagedRoundSubmissionTypeEnum] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size_bytes: Optional[int] = None
    mime_type: Optional[str] = None
    link_url: Optional[str] = None
    notes: Optional[str] = None
    version: int = 0
    is_locked: bool = False
    submitted_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    updated_by_user_id: Optional[int] = None
    is_editable: bool = False
    lock_reason: Optional[str] = None
    deadline_at: Optional[datetime] = None


class PdaRoundSubmissionAdminListItem(PdaRoundSubmissionResponse):
    participant_name: str
    participant_register_number: str
    participant_status: str


class PdaManagedAttendanceMarkRequest(BaseModel):
    entity_type: PdaManagedEntityTypeEnum
    user_id: Optional[int] = None
    team_id: Optional[int] = None
    round_id: int
    is_present: bool = True


class PdaManagedAttendanceScanRequest(BaseModel):
    token: str
    round_id: int


class PdaManagedAttendanceResponse(BaseModel):
    id: int
    event_id: int
    round_id: Optional[int] = None
    entity_type: PdaManagedEntityTypeEnum
    user_id: Optional[int] = None
    team_id: Optional[int] = None
    is_present: bool
    marked_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PdaManagedRegistrationStatusBulkUpdate(BaseModel):
    entity_type: PdaManagedEntityTypeEnum
    entity_id: int = Field(..., ge=1)
    status: ParticipantStatusEnum


class PdaManagedRegistrationStatusBulkRequest(BaseModel):
    updates: List[PdaManagedRegistrationStatusBulkUpdate] = Field(default_factory=list)


class PdaManagedRegistrationStatusBulkResponse(BaseModel):
    updated_count: int = 0


class PdaManagedScoreEntry(BaseModel):
    entity_type: PdaManagedEntityTypeEnum
    user_id: Optional[int] = None
    team_id: Optional[int] = None
    criteria_scores: Dict[str, float] = Field(default_factory=dict)
    is_present: bool = True


class PdaRoundPanelAdminOption(BaseModel):
    admin_user_id: int
    regno: str
    name: str
    email: Optional[str] = None


class PdaRoundPanelMemberResponse(BaseModel):
    admin_user_id: int
    regno: str
    name: str
    email: Optional[str] = None


class PdaRoundPanelDefinition(BaseModel):
    id: Optional[int] = None
    panel_no: int = Field(..., ge=1, le=1000)
    panel_name: Optional[str] = None
    panel_link: Optional[str] = None
    panel_time: Optional[datetime] = None
    instructions: Optional[str] = None
    member_admin_user_ids: List[int] = Field(default_factory=list)

    @field_validator("panel_name", "instructions", mode="before")
    @classmethod
    def normalize_optional_text(cls, value):
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None

    @field_validator("panel_link", mode="before")
    @classmethod
    def normalize_optional_panel_link(cls, value):
        return _normalize_optional_http_url(value, "panel_link")


class PdaRoundPanelResponse(BaseModel):
    id: int
    event_id: int
    round_id: int
    panel_no: int
    panel_name: Optional[str] = None
    panel_link: Optional[str] = None
    panel_time: Optional[datetime] = None
    instructions: Optional[str] = None
    members: List[PdaRoundPanelMemberResponse] = Field(default_factory=list)
    assignment_count: int = 0


class PdaRoundPanelListResponse(BaseModel):
    panel_mode_enabled: bool = False
    panel_team_distribution_mode: PdaManagedPanelTeamDistributionModeEnum = PdaManagedPanelTeamDistributionModeEnum.TEAM_COUNT
    panel_structure_locked: bool = False
    current_admin_is_superadmin: bool = False
    my_panel_ids: List[int] = Field(default_factory=list)
    available_admins: List[PdaRoundPanelAdminOption] = Field(default_factory=list)
    panels: List[PdaRoundPanelResponse] = Field(default_factory=list)


class PdaRoundPanelsUpdateRequest(BaseModel):
    panels: List[PdaRoundPanelDefinition] = Field(default_factory=list)


class PdaRoundPanelsAutoAssignRequest(BaseModel):
    include_unassigned_only: bool = False


class PdaRoundPanelAssignmentItem(BaseModel):
    entity_type: PdaManagedEntityTypeEnum
    entity_id: int = Field(..., ge=1)
    panel_id: Optional[int] = None


class PdaRoundPanelAssignmentsUpdateRequest(BaseModel):
    assignments: List[PdaRoundPanelAssignmentItem] = Field(default_factory=list)


class PdaRoundPanelEmailRequest(BaseModel):
    subject: str = Field(..., min_length=1)
    html: str = Field(..., min_length=1)
    text: Optional[str] = None
    panel_ids: Optional[List[int]] = None


class PdaManagedScoreResponse(BaseModel):
    id: int
    event_id: int
    round_id: int
    entity_type: PdaManagedEntityTypeEnum
    user_id: Optional[int] = None
    team_id: Optional[int] = None
    criteria_scores: Optional[Dict[str, float]] = None
    total_score: float
    normalized_score: float
    is_present: bool

    class Config:
        from_attributes = True


class PdaManagedParticipantListItem(BaseModel):
    entity_type: PdaManagedEntityTypeEnum
    entity_id: int
    name: str
    regno_or_code: str
    members_count: Optional[int] = None
    is_registered: bool = True
    cumulative_score: float = 0
    attendance_count: int = 0


class PdaManagedBadgeCreate(BaseModel):
    title: str = Field(..., min_length=2)
    image_url: Optional[str] = None
    place: PdaManagedBadgePlaceEnum
    score: Optional[float] = None
    user_id: Optional[int] = None
    team_id: Optional[int] = None


class PdaManagedBadgeResponse(BaseModel):
    id: int
    event_id: int
    title: str
    image_url: Optional[str] = None
    place: PdaManagedBadgePlaceEnum
    score: Optional[float] = None
    user_id: Optional[int] = None
    team_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PdaManagedMyEvent(BaseModel):
    event: PdaManagedEventResponse
    entity_type: Optional[PdaManagedEntityTypeEnum] = None
    entity_id: Optional[int] = None
    is_registered: bool = False
    attendance_count: int = 0
    cumulative_score: float = 0


class PdaManagedAchievement(BaseModel):
    event_slug: str
    event_title: str
    badge_title: str
    badge_place: PdaManagedBadgePlaceEnum
    image_url: Optional[str] = None
    score: Optional[float] = None


class PdaManagedCertificateResponse(BaseModel):
    event_slug: str
    event_title: str
    eligible: bool
    certificate_text: Optional[str] = None
    generated_at: Optional[datetime] = None


class PdaManagedQrResponse(BaseModel):
    event_slug: str
    entity_type: PdaManagedEntityTypeEnum
    entity_id: int
    qr_token: str


class AdminBulkEmailRequest(BaseModel):
    subject: str = Field(..., min_length=1)
    html: str = Field(..., min_length=1)
    text: Optional[str] = None
    recipient_mode: str = Field(..., min_length=1)
    batch: Optional[str] = None
    department: Optional[str] = None
    user_ids: Optional[List[int]] = None


class EventBulkEmailRequest(BaseModel):
    subject: str = Field(..., min_length=1)
    html: str = Field(..., min_length=1)
    text: Optional[str] = None
    recipient_mode: str = Field(..., min_length=1)
    selected_source: Optional[str] = None
    top_k: Optional[int] = None
    random_count: Optional[int] = None
    entity_ids: Optional[List[int]] = None
    department: Optional[str] = None
    gender: Optional[str] = None
    batch: Optional[str] = None
    status: Optional[str] = None
    search: Optional[str] = None


# Persohub event parity schemas: mirror PDA managed behavior with Persohub event identity.
class PersohubManagedEventTypeEnum(str, Enum):
    TECHNICAL = "Technical"
    FUNTECHINICAL = "FunTechinical"
    HACKATHON = "Hackathon"
    SIGNATURE = "Signature"
    NONTECHINICAL = "NonTechinical"
    SESSION = "Session"
    WORKSHOP = "Workshop"
    EVENT = "Event"


PersohubManagedEventFormatEnum = PdaManagedEventFormatEnum
PersohubManagedEventTemplateEnum = PdaManagedEventTemplateEnum
PersohubManagedParticipantModeEnum = PdaManagedParticipantModeEnum
PersohubManagedRoundModeEnum = PdaManagedRoundModeEnum
PersohubManagedEventStatusEnum = PdaManagedEventStatusEnum
PersohubManagedEventOpenForEnum = PdaManagedEventOpenForEnum
PersohubManagedEntityTypeEnum = PdaManagedEntityTypeEnum
PersohubManagedRoundStateEnum = PdaManagedRoundStateEnum
PersohubManagedRoundSubmissionModeEnum = PdaManagedRoundSubmissionModeEnum
PersohubManagedRoundSubmissionTypeEnum = PdaManagedRoundSubmissionTypeEnum
PersohubManagedBadgePlaceEnum = PdaManagedBadgePlaceEnum
PersohubManagedPanelTeamDistributionModeEnum = PdaManagedPanelTeamDistributionModeEnum


class PersohubManagedEventCreate(BaseModel):
    title: str = Field(..., min_length=2)
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    poster_url: Optional[str] = None
    whatsapp_url: Optional[str] = None
    external_url_name: Optional[str] = "Join whatsapp channel"
    event_type: PersohubManagedEventTypeEnum
    format: PersohubManagedEventFormatEnum
    template_option: PersohubManagedEventTemplateEnum
    participant_mode: PersohubManagedParticipantModeEnum
    round_mode: PersohubManagedRoundModeEnum
    round_count: int = Field(1, ge=1, le=20)
    team_min_size: Optional[int] = Field(None, ge=1, le=100)
    team_max_size: Optional[int] = Field(None, ge=1, le=100)
    # Keep optional compatibility fields; backend resolves target community from auth.
    club_id: Optional[int] = Field(default=None, ge=1)
    community_id: Optional[int] = Field(default=None, ge=1)
    open_for: PersohubManagedEventOpenForEnum = PersohubManagedEventOpenForEnum.MIT

    @field_validator("whatsapp_url", mode="before")
    @classmethod
    def validate_whatsapp_url(cls, value):
        return _normalize_optional_http_url(value, "whatsapp_url")


class PersohubManagedEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    poster_url: Optional[str] = None
    whatsapp_url: Optional[str] = None
    external_url_name: Optional[str] = None
    event_type: Optional[PersohubManagedEventTypeEnum] = None
    format: Optional[PersohubManagedEventFormatEnum] = None
    template_option: Optional[PersohubManagedEventTemplateEnum] = None
    participant_mode: Optional[PersohubManagedParticipantModeEnum] = None
    round_mode: Optional[PersohubManagedRoundModeEnum] = None
    round_count: Optional[int] = Field(None, ge=1, le=20)
    team_min_size: Optional[int] = Field(None, ge=1, le=100)
    team_max_size: Optional[int] = Field(None, ge=1, le=100)
    is_visible: Optional[bool] = None
    status: Optional[PersohubManagedEventStatusEnum] = None
    open_for: Optional[PersohubManagedEventOpenForEnum] = None

    @field_validator("whatsapp_url", mode="before")
    @classmethod
    def validate_whatsapp_url(cls, value):
        return _normalize_optional_http_url(value, "whatsapp_url")


class PersohubManagedEventStatusUpdate(PdaManagedEventStatusUpdate):
    pass


class PersohubManagedEventVisibilityUpdate(PdaManagedEventVisibilityUpdate):
    pass


class PersohubManagedEventRegistrationUpdate(PdaManagedEventRegistrationUpdate):
    pass


class PersohubManagedEventResponse(BaseModel):
    id: int
    slug: str
    event_code: str
    community_id: int
    title: str
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    poster_url: Optional[str] = None
    whatsapp_url: Optional[str] = None
    external_url_name: Optional[str] = "Join whatsapp channel"
    event_type: PersohubManagedEventTypeEnum
    format: PersohubManagedEventFormatEnum
    template_option: PersohubManagedEventTemplateEnum
    participant_mode: PersohubManagedParticipantModeEnum
    round_mode: PersohubManagedRoundModeEnum
    round_count: int
    team_min_size: Optional[int] = None
    team_max_size: Optional[int] = None
    is_visible: bool = True
    registration_open: bool = True
    open_for: PersohubManagedEventOpenForEnum = PersohubManagedEventOpenForEnum.MIT
    status: PersohubManagedEventStatusEnum
    created_at: datetime

    class Config:
        from_attributes = True


class PersohubManagedEventDashboard(BaseModel):
    event: PersohubManagedEventResponse
    is_registered: bool = False
    entity_type: Optional[PersohubManagedEntityTypeEnum] = None
    entity_id: Optional[int] = None
    team_code: Optional[str] = None
    team_name: Optional[str] = None
    team_members: List[Dict[str, Any]] = Field(default_factory=list)
    rounds_count: int = 0
    badges_count: int = 0


class PersohubEventPublicRoundResponse(PdaEventPublicRoundResponse):
    pass


class PersohubManagedTeamCreate(PdaManagedTeamCreate):
    pass


class PersohubManagedTeamJoin(PdaManagedTeamJoin):
    pass


class PersohubManagedTeamInvite(PdaManagedTeamInvite):
    pass


class PersohubManagedTeamMemberResponse(PdaManagedTeamMemberResponse):
    pass


class PersohubManagedTeamResponse(PdaManagedTeamResponse):
    pass


class PersohubManagedRoundCriteria(PdaManagedRoundCriteria):
    pass


class PersohubManagedRoundCreate(PdaManagedRoundCreate):
    pass


class PersohubManagedRoundUpdate(PdaManagedRoundUpdate):
    pass


class PersohubManagedRoundResponse(PdaManagedRoundResponse):
    pass


class PersohubRoundSubmissionPresignRequest(PdaRoundSubmissionPresignRequest):
    pass


class PersohubRoundSubmissionUpsertRequest(PdaRoundSubmissionUpsertRequest):
    pass


class PersohubRoundSubmissionAdminUpdate(PdaRoundSubmissionAdminUpdate):
    pass


class PersohubRoundSubmissionResponse(PdaRoundSubmissionResponse):
    pass


class PersohubRoundSubmissionAdminListItem(PdaRoundSubmissionAdminListItem):
    pass


class PersohubManagedAttendanceMarkRequest(PdaManagedAttendanceMarkRequest):
    pass


class PersohubManagedAttendanceScanRequest(PdaManagedAttendanceScanRequest):
    pass


class PersohubManagedAttendanceResponse(PdaManagedAttendanceResponse):
    pass


class PersohubManagedRegistrationStatusBulkUpdate(PdaManagedRegistrationStatusBulkUpdate):
    pass


class PersohubManagedRegistrationStatusBulkRequest(PdaManagedRegistrationStatusBulkRequest):
    pass


class PersohubManagedRegistrationStatusBulkResponse(PdaManagedRegistrationStatusBulkResponse):
    pass


class PersohubManagedScoreEntry(PdaManagedScoreEntry):
    pass


class PersohubRoundPanelAdminOption(PdaRoundPanelAdminOption):
    pass


class PersohubRoundPanelMemberResponse(PdaRoundPanelMemberResponse):
    pass


class PersohubRoundPanelDefinition(PdaRoundPanelDefinition):
    pass


class PersohubRoundPanelResponse(PdaRoundPanelResponse):
    pass


class PersohubRoundPanelListResponse(PdaRoundPanelListResponse):
    pass


class PersohubRoundPanelsUpdateRequest(PdaRoundPanelsUpdateRequest):
    pass


class PersohubRoundPanelsAutoAssignRequest(PdaRoundPanelsAutoAssignRequest):
    pass


class PersohubRoundPanelAssignmentItem(PdaRoundPanelAssignmentItem):
    pass


class PersohubRoundPanelAssignmentsUpdateRequest(PdaRoundPanelAssignmentsUpdateRequest):
    pass


class PersohubRoundPanelEmailRequest(PdaRoundPanelEmailRequest):
    pass


class PersohubManagedScoreResponse(PdaManagedScoreResponse):
    pass


class PersohubManagedParticipantListItem(PdaManagedParticipantListItem):
    pass


class PersohubManagedBadgeCreate(PdaManagedBadgeCreate):
    pass


class PersohubManagedBadgeResponse(PdaManagedBadgeResponse):
    pass


class PersohubManagedMyEvent(BaseModel):
    event: PersohubManagedEventResponse
    entity_type: Optional[PersohubManagedEntityTypeEnum] = None
    entity_id: Optional[int] = None
    is_registered: bool = False
    attendance_count: int = 0
    cumulative_score: float = 0


class PersohubManagedAchievement(PdaManagedAchievement):
    pass


class PersohubManagedCertificateResponse(PdaManagedCertificateResponse):
    pass


class PersohubManagedQrResponse(PdaManagedQrResponse):
    pass


class PersohubEventLogResponse(PdaEventLogResponse):
    pass


# Update forward reference
TokenResponse.model_rebuild()
