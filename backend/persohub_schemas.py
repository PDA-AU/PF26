import json
from datetime import date, datetime, time
from enum import Enum
from typing import Any, Dict, List, Optional, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic import model_validator

POSTER_ASSET_ALLOWED_ASPECT_RATIOS = {
    "1:1",
    "2:1",
    "4:5",
    "5:4",
    "A4-portrait",
    "A4-landscape",
}


class PersohubRefreshRequest(BaseModel):
    refresh_token: str


class PersohubCommunityAuthResponse(BaseModel):
    id: int
    name: str
    profile_id: str
    admin_id: Optional[int] = None
    admin_name: Optional[str] = None
    admin_regno: Optional[str] = None
    current_admin_user_id: Optional[int] = None
    current_admin_name: Optional[str] = None
    current_admin_regno: Optional[str] = None
    current_admin_role: Optional[Literal["owner", "superadmin", "admin", "community_account"]] = None
    logo_url: Optional[str] = None
    club_id: Optional[int] = None
    club_name: Optional[str] = None
    club_profile_id: Optional[str] = None
    club_owner_user_id: Optional[int] = None
    is_club_owner: bool = False
    is_club_superadmin: bool = False
    can_access_events: bool = False
    persohub_events_access_status: Literal["pending", "approved", "rejected"] = "rejected"
    persohub_events_access_approved: bool = False
    persohub_events_access_review_note: Optional[str] = None
    event_policy: dict = Field(default_factory=lambda: {"events": {}})
    is_root: bool = False


class PersohubCommunityLoginRequest(BaseModel):
    profile_id: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6)


class PersohubCommunityTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    community: PersohubCommunityAuthResponse


class PersohubAdminLoginRequest(BaseModel):
    identifier: str = Field(..., min_length=2, max_length=255)
    password: str = Field(..., min_length=6)

    @field_validator("identifier", mode="before")
    @classmethod
    def normalize_identifier(cls, value):
        normalized = str(value or "").strip()
        if not normalized:
            raise ValueError("identifier is required")
        return normalized


class PersohubAdminClubOption(BaseModel):
    club_id: int
    club_name: str
    club_profile_id: Optional[str] = None
    role: Literal["owner", "superadmin", "admin"]
    can_access_events: bool = False
    persohub_events_access_status: Literal["pending", "approved", "rejected"] = "rejected"
    persohub_events_access_approved: bool = False


class PersohubAdminLoginResponse(BaseModel):
    requires_club_selection: bool = True
    selection_token: str
    clubs: List[PersohubAdminClubOption] = Field(default_factory=list)


class PersohubAdminCommunitySelectRequest(BaseModel):
    selection_token: str
    club_id: Optional[int] = Field(default=None, ge=1)
    community_id: Optional[int] = Field(default=None, ge=1)

    @field_validator("community_id", "club_id", mode="before")
    @classmethod
    def _normalize_optional_int(cls, value):
        if value is None:
            return None
        return int(value)

    @model_validator(mode="after")
    def _validate_target(self):
        if self.club_id is None and self.community_id is None:
            raise ValueError("club_id or community_id is required")
        return self


class PersohubAdminTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    community: PersohubCommunityAuthResponse


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


def _normalize_optional_http_url_or_assets_json(
    value: Optional[str],
    field_name: str,
    max_length: int = 20_000,
) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw:
        return None
    if len(raw) > max_length:
        raise ValueError(f"{field_name} must be at most {max_length} characters")
    if raw.startswith("["):
        try:
            parsed = json.loads(raw)
        except Exception as exc:
            raise ValueError(f"{field_name} must be a valid JSON array") from exc
        if not isinstance(parsed, list):
            raise ValueError(f"{field_name} must be a JSON array")
        normalized_assets = []
        for index, asset in enumerate(parsed):
            if not isinstance(asset, dict):
                raise ValueError(f"{field_name}[{index}] must be an object")
            normalized_url = _normalize_optional_http_url(
                asset.get("url") or asset.get("src"),
                f"{field_name}[{index}].url",
                max_length=800,
            )
            if not normalized_url:
                raise ValueError(f"{field_name}[{index}].url is required")
            normalized_asset = {"url": normalized_url}
            aspect_ratio = str(asset.get("aspect_ratio") or asset.get("ratio") or "").strip()
            if aspect_ratio:
                if aspect_ratio not in POSTER_ASSET_ALLOWED_ASPECT_RATIOS:
                    allowed = ", ".join(sorted(POSTER_ASSET_ALLOWED_ASPECT_RATIOS))
                    raise ValueError(
                        f"{field_name}[{index}].aspect_ratio must be one of: {allowed}"
                    )
                normalized_asset["aspect_ratio"] = aspect_ratio
            normalized_assets.append(normalized_asset)
        return json.dumps(normalized_assets, separators=(",", ":"))
    return _normalize_optional_http_url(raw, field_name, max_length=800)


class PersohubAdminCommunityProfile(BaseModel):
    id: int
    name: str
    profile_id: str
    logo_url: Optional[str] = None
    description: Optional[str] = None
    is_active: bool
    is_root: bool = False
    club_id: Optional[int] = None


class PersohubAdminClubProfile(BaseModel):
    id: int
    name: str
    club_logo_url: Optional[str] = None
    club_tagline: Optional[str] = None
    club_description: Optional[str] = None
    club_url: Optional[str] = None
    payment_url_image: Optional[str] = None
    payment_id: Optional[str] = None
    owner_name: Optional[str] = None
    linked_community_count: int = 0
    can_edit: bool = True


class PersohubAdminProfileResponse(BaseModel):
    community: PersohubAdminCommunityProfile
    club: Optional[PersohubAdminClubProfile] = None


class PersohubAdminEventTypeEnum(str, Enum):
    TECHNICAL = "Technical"
    FUNTECHINICAL = "FunTechinical"
    HACKATHON = "Hackathon"
    SIGNATURE = "Signature"
    NONTECHINICAL = "NonTechinical"
    SESSION = "Session"
    WORKSHOP = "Workshop"
    EVENT = "Event"


class PersohubAdminEventFormatEnum(str, Enum):
    ONLINE = "Online"
    OFFLINE = "Offline"
    HYBRID = "Hybrid"


class PersohubAdminEventTemplateEnum(str, Enum):
    ATTENDANCE_ONLY = "attendance_only"
    ATTENDANCE_SCORING = "attendance_scoring"


class PersohubAdminParticipantModeEnum(str, Enum):
    INDIVIDUAL = "individual"
    TEAM = "team"


class PersohubAdminRoundModeEnum(str, Enum):
    SINGLE = "single"
    MULTI = "multi"


class PersohubFeedTypeEnum(str, Enum):
    ALL = "all"
    EVENT = "event"
    COMMUNITY = "community"


class PersohubAdminEventStatusEnum(str, Enum):
    OPEN = "open"
    CLOSED = "closed"


class PersohubAdminEventOpenForEnum(str, Enum):
    MIT = "MIT"
    ALL = "ALL"


class PersohubRegistrationFeeConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = False
    currency: Optional[str] = "INR"
    amounts: Optional[Dict[str, float]] = None

    @field_validator("currency", mode="before")
    @classmethod
    def _normalize_currency(cls, value):
        normalized = str(value or "INR").strip().upper()
        return normalized or "INR"

    @model_validator(mode="after")
    def _validate_amounts(self):
        if not self.enabled:
            return self
        amount_map = self.amounts if isinstance(self.amounts, dict) else {}
        mit_amount = amount_map.get("MIT")
        other_amount = amount_map.get("Other")
        if mit_amount is None or other_amount is None:
            raise ValueError("registration_fee.amounts requires MIT and Other")
        if float(mit_amount) < 0 or float(other_amount) < 0:
            raise ValueError("registration_fee amounts must be >= 0")
        self.amounts = {
            "MIT": float(mit_amount),
            "Other": float(other_amount),
        }
        self.currency = str(self.currency or "INR").strip().upper() or "INR"
        return self


class PersohubAdminEventCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    event_time: Optional[time] = None
    poster_url: Optional[str] = None
    whatsapp_url: Optional[str] = None
    external_url_name: Optional[str] = "Join whatsapp channel"
    event_type: PersohubAdminEventTypeEnum
    format: PersohubAdminEventFormatEnum
    template_option: PersohubAdminEventTemplateEnum
    participant_mode: PersohubAdminParticipantModeEnum
    round_mode: PersohubAdminRoundModeEnum
    open_for: PersohubAdminEventOpenForEnum = PersohubAdminEventOpenForEnum.MIT
    round_count: int = Field(1, ge=1, le=20)
    team_min_size: Optional[int] = Field(None, ge=1, le=100)
    team_max_size: Optional[int] = Field(None, ge=1, le=100)
    registration_fee: Optional[PersohubRegistrationFeeConfig] = None
    seat_availability_enabled: bool = False
    seat_capacity: Optional[int] = None

    @field_validator("title", mode="before")
    @classmethod
    def _normalize_title(cls, value):
        normalized = str(value or "").strip()
        if len(normalized) < 2:
            raise ValueError("title must be at least 2 characters")
        return normalized

    @field_validator("description", mode="before")
    @classmethod
    def _normalize_description(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    @field_validator("poster_url", mode="before")
    @classmethod
    def _normalize_poster_url(cls, value):
        return _normalize_optional_http_url_or_assets_json(value, "poster_url")

    @field_validator("whatsapp_url", mode="before")
    @classmethod
    def _normalize_whatsapp_url(cls, value):
        return _normalize_optional_http_url(value, "whatsapp_url", max_length=500)

    @field_validator("external_url_name", mode="before")
    @classmethod
    def _normalize_external_url_name(cls, value):
        normalized = str(value or "").strip()
        return normalized or "Join whatsapp channel"

    @model_validator(mode="after")
    def _normalize_seat_capacity(self):
        if self.seat_capacity is not None:
            self.seat_capacity = int(self.seat_capacity)
            if self.seat_capacity < 1:
                if self.seat_availability_enabled:
                    self.seat_capacity = 100
                else:
                    raise ValueError("seat_capacity must be >= 1")
        if self.seat_availability_enabled and self.seat_capacity is None:
            self.seat_capacity = 100
        return self


class PersohubAdminEventUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(default=None, min_length=2, max_length=255)
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    event_time: Optional[time] = None
    poster_url: Optional[str] = None
    whatsapp_url: Optional[str] = None
    external_url_name: Optional[str] = None
    event_type: Optional[PersohubAdminEventTypeEnum] = None
    format: Optional[PersohubAdminEventFormatEnum] = None
    template_option: Optional[PersohubAdminEventTemplateEnum] = None
    participant_mode: Optional[PersohubAdminParticipantModeEnum] = None
    round_mode: Optional[PersohubAdminRoundModeEnum] = None
    open_for: Optional[PersohubAdminEventOpenForEnum] = None
    round_count: Optional[int] = Field(default=None, ge=1, le=20)
    team_min_size: Optional[int] = Field(default=None, ge=1, le=100)
    team_max_size: Optional[int] = Field(default=None, ge=1, le=100)
    registration_fee: Optional[PersohubRegistrationFeeConfig] = None
    seat_availability_enabled: Optional[bool] = None
    seat_capacity: Optional[int] = None
    is_visible: Optional[bool] = None
    status: Optional[PersohubAdminEventStatusEnum] = None

    @field_validator("title", mode="before")
    @classmethod
    def _normalize_title(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        if len(normalized) < 2:
            raise ValueError("title must be at least 2 characters")
        return normalized

    @field_validator("description", mode="before")
    @classmethod
    def _normalize_description(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    @field_validator("poster_url", mode="before")
    @classmethod
    def _normalize_poster_url(cls, value):
        return _normalize_optional_http_url_or_assets_json(value, "poster_url")

    @field_validator("whatsapp_url", mode="before")
    @classmethod
    def _normalize_whatsapp_url(cls, value):
        return _normalize_optional_http_url(value, "whatsapp_url", max_length=500)

    @field_validator("external_url_name", mode="before")
    @classmethod
    def _normalize_external_url_name(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or "Join whatsapp channel"

    @model_validator(mode="after")
    def _normalize_seat_capacity(self):
        if self.seat_capacity is not None:
            self.seat_capacity = int(self.seat_capacity)
            if self.seat_capacity < 1:
                if self.seat_availability_enabled is True:
                    self.seat_capacity = 100
                else:
                    raise ValueError("seat_capacity must be >= 1")
        if self.seat_availability_enabled is True and self.seat_capacity is None:
            self.seat_capacity = 100
        return self


class PersohubAdminEventResponse(BaseModel):
    id: int
    slug: str
    event_code: str
    club_id: int
    community_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    event_time: Optional[time] = None
    poster_url: Optional[str] = None
    whatsapp_url: Optional[str] = None
    external_url_name: str = "Join whatsapp channel"
    event_type: PersohubAdminEventTypeEnum
    format: PersohubAdminEventFormatEnum
    template_option: PersohubAdminEventTemplateEnum
    participant_mode: PersohubAdminParticipantModeEnum
    round_mode: PersohubAdminRoundModeEnum
    round_count: int
    team_min_size: Optional[int] = None
    team_max_size: Optional[int] = None
    registration_fee: Optional[PersohubRegistrationFeeConfig] = None
    persohub_access_status: Literal["pending", "approved", "rejected"] = "rejected"
    persohub_access_approved: bool = False
    persohub_access_review_note: Optional[str] = None
    seat_availability_enabled: bool = False
    seat_capacity: Optional[int] = None
    is_visible: bool = True
    open_for: PersohubAdminEventOpenForEnum = PersohubAdminEventOpenForEnum.MIT
    status: PersohubAdminEventStatusEnum
    sympo_id: Optional[int] = None
    sympo_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class PersohubAdminEventSympoAssignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sympo_id: Optional[int] = Field(default=None, ge=1)


class PersohubAdminEventSympoAssignResponse(BaseModel):
    event_id: int
    sympo_id: Optional[int] = None
    sympo_name: Optional[str] = None
    message: str


class PersohubAdminSympoOption(BaseModel):
    id: int
    name: str
    organising_club_id: int
    organising_club_name: Optional[str] = None


class PersohubAdminCommunityUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def _normalize_name(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        if not normalized:
            raise ValueError("name cannot be empty")
        return normalized

    @field_validator("logo_url", mode="before")
    @classmethod
    def _normalize_logo_url(cls, value):
        return _normalize_optional_logo_url(value, "logo_url")


class PersohubAdminClubUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    club_logo_url: Optional[str] = Field(default=None, max_length=500)
    club_tagline: Optional[str] = Field(default=None, max_length=255)
    club_description: Optional[str] = None
    club_url: Optional[str] = Field(default=None, max_length=500)
    payment_url_image: Optional[str] = Field(default=None, max_length=800)
    payment_id: Optional[str] = Field(default=None, max_length=120)

    @field_validator("name", mode="before")
    @classmethod
    def _normalize_name(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        if not normalized:
            raise ValueError("name cannot be empty")
        return normalized

    @field_validator("club_logo_url", mode="before")
    @classmethod
    def _normalize_club_logo_url(cls, value):
        return _normalize_optional_logo_url(value, "club_logo_url")

    @field_validator("club_tagline", "club_description", mode="before")
    @classmethod
    def _normalize_optional_text(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    @field_validator("club_url", mode="before")
    @classmethod
    def _normalize_club_url(cls, value):
        return _normalize_optional_http_url(value, "club_url")

    @field_validator("payment_url_image", mode="before")
    @classmethod
    def _normalize_payment_url_image(cls, value):
        return _normalize_optional_http_url(value, "payment_url_image", max_length=800)

    @field_validator("payment_id", mode="before")
    @classmethod
    def _normalize_payment_id(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None


class PersohubAdminPaymentReviewListItem(BaseModel):
    id: int
    event_id: int
    event_slug: str
    event_title: str
    club_id: int
    club_name: Optional[str] = None
    user_id: int
    participant_name: str
    participant_regno: Optional[str] = None
    participant_email: Optional[str] = None
    participant_phno: Optional[str] = None
    participant_college: Optional[str] = None
    participant_dept: Optional[str] = None
    payment_info_url: str
    status: str
    fee_key: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    comment: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    team_id: Optional[int] = None
    attempt: int = 1
    review: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class PersohubAdminPaymentConfirmRequest(BaseModel):
    password: str = Field(..., min_length=6)


class PersohubAdminPaymentDeclineRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def _normalize_reason(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None


class PersohubAdminUserOption(BaseModel):
    id: int
    regno: Optional[str] = None
    name: Optional[str] = None


class PersohubAdminCommunityAdminInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: int = Field(..., ge=1)
    is_active: bool = True


class PersohubAdminCommunityAdminResponse(BaseModel):
    user_id: int
    regno: Optional[str] = None
    name: Optional[str] = None
    is_active: bool = True


class PersohubAdminCommunityManageCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=120)
    profile_id: str = Field(..., min_length=3, max_length=64)
    admins: List[PersohubAdminCommunityAdminInput] = Field(default_factory=list)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    is_active: bool = True

    @field_validator("name", mode="before")
    @classmethod
    def _normalize_name(cls, value):
        normalized = str(value or "").strip()
        if not normalized:
            raise ValueError("name cannot be empty")
        return normalized

    @field_validator("profile_id", mode="before")
    @classmethod
    def _normalize_profile_id(cls, value):
        normalized = str(value or "").strip().lower()
        if not normalized:
            raise ValueError("profile_id is required")
        return normalized

    @field_validator("logo_url", mode="before")
    @classmethod
    def _normalize_logo_url(cls, value):
        return _normalize_optional_logo_url(value, "logo_url")

    @field_validator("description", mode="before")
    @classmethod
    def _normalize_description(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    @model_validator(mode="after")
    def _validate_admins(self):
        active_admins = [item for item in (self.admins or []) if bool(item.is_active)]
        if not active_admins:
            raise ValueError("At least one active admin is required")
        return self


class PersohubAdminCommunityManageUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    admins: Optional[List[PersohubAdminCommunityAdminInput]] = None
    logo_url: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("name", mode="before")
    @classmethod
    def _normalize_name(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        if not normalized:
            raise ValueError("name cannot be empty")
        return normalized

    @field_validator("logo_url", mode="before")
    @classmethod
    def _normalize_logo_url(cls, value):
        return _normalize_optional_logo_url(value, "logo_url")

    @field_validator("description", mode="before")
    @classmethod
    def _normalize_description(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    @model_validator(mode="after")
    def _validate_admins(self):
        if self.admins is None:
            return self
        active_admins = [item for item in self.admins if bool(item.is_active)]
        if not active_admins:
            raise ValueError("At least one active admin is required")
        return self


class PersohubAdminCommunityManageResponse(BaseModel):
    id: int
    name: str
    profile_id: str
    club_id: Optional[int] = None
    club_name: Optional[str] = None
    admin_id: Optional[int] = None
    admin_name: Optional[str] = None
    admin_regno: Optional[str] = None
    admins: List[PersohubAdminCommunityAdminResponse] = Field(default_factory=list)
    logo_url: Optional[str] = None
    description: Optional[str] = None
    is_active: bool
    is_root: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PersohubAdminEventPolicyAdminRow(BaseModel):
    user_id: int
    regno: Optional[str] = None
    name: Optional[str] = None
    is_club_owner: bool = False
    policy: dict = Field(default_factory=lambda: {"events": {}})


class PersohubAdminEventPoliciesResponse(BaseModel):
    events: List[PersohubAdminEventResponse] = Field(default_factory=list)
    admins: List[PersohubAdminEventPolicyAdminRow] = Field(default_factory=list)


class PersohubAdminEventPolicyUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    policy: dict = Field(default_factory=lambda: {"events": {}})


class PersohubAdminEventAdminCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: int = Field(..., ge=1)
    community_id: Optional[int] = Field(default=None, ge=1)


class PersohubAdminClubSuperadminCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: int = Field(..., ge=1)


class PersohubAdminClubSuperadminResponse(BaseModel):
    id: int
    club_id: int
    user_id: int
    regno: Optional[str] = None
    name: Optional[str] = None
    role: Literal["superadmin"] = "superadmin"
    is_active: bool = True
    created_by_user_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class PersohubAdminProfileUploadPresignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: str = Field(..., min_length=1)
    content_type: str = Field(..., min_length=1)
    size_bytes: int = Field(..., ge=1)


class PersohubAdminProfileUploadPresignResponse(BaseModel):
    upload_url: str
    public_url: str
    key: str
    content_type: str


class PersohubUploadPresignRequest(BaseModel):
    filename: str = Field(..., min_length=1)
    content_type: str = Field(..., min_length=1)
    size_bytes: int = Field(..., ge=1)


class PersohubUploadPresignResponse(BaseModel):
    upload_mode: Literal["single"]
    upload_url: str
    public_url: str
    key: str
    content_type: str


class PersohubMultipartInitRequest(BaseModel):
    filename: str = Field(..., min_length=1)
    content_type: str = Field(..., min_length=1)
    size_bytes: int = Field(..., ge=1)


class PersohubMultipartInitResponse(BaseModel):
    upload_mode: Literal["multipart"]
    key: str
    upload_id: str
    public_url: str
    part_size: int


class PersohubMultipartPartUrlRequest(BaseModel):
    key: str = Field(..., min_length=1)
    upload_id: str = Field(..., min_length=1)
    part_number: int = Field(..., ge=1)


class PersohubMultipartPartUrlResponse(BaseModel):
    upload_url: str
    part_number: int


class PersohubMultipartPart(BaseModel):
    part_number: int = Field(..., ge=1)
    etag: str = Field(..., min_length=1)


class PersohubMultipartCompleteRequest(BaseModel):
    key: str = Field(..., min_length=1)
    upload_id: str = Field(..., min_length=1)
    parts: List[PersohubMultipartPart] = Field(default_factory=list)


class PersohubMultipartCompleteResponse(BaseModel):
    public_url: str
    key: str


class PersohubMultipartAbortRequest(BaseModel):
    key: str = Field(..., min_length=1)
    upload_id: str = Field(..., min_length=1)


class PersohubPdfPreviewGenerateRequest(BaseModel):
    s3_url: str = Field(..., min_length=5)
    max_pages: int = Field(default=20, ge=1, le=20)


class PersohubPdfPreviewGenerateResponse(BaseModel):
    preview_image_urls: List[str] = Field(default_factory=list)
    pages_generated: int = 0


class PersohubAttachmentIn(BaseModel):
    s3_url: str = Field(..., min_length=5)
    preview_image_urls: List[str] = Field(default_factory=list)
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = Field(default=None, ge=1)


class PersohubPostCreateRequest(BaseModel):
    description: Optional[str] = None
    attachments: List[PersohubAttachmentIn] = Field(default_factory=list)
    mentions: List[str] = Field(default_factory=list)


class PersohubPostUpdateRequest(BaseModel):
    description: Optional[str] = None
    attachments: Optional[List[PersohubAttachmentIn]] = None
    mentions: Optional[List[str]] = None


class PersohubPostVisibilityUpdateRequest(BaseModel):
    is_hidden: int = Field(default=1, ge=0, le=1)


class PersohubCommentCreateRequest(BaseModel):
    comment_text: str = Field(..., min_length=1, max_length=2000)


class PersohubCommunityCard(BaseModel):
    id: int
    name: str
    profile_id: str
    logo_url: Optional[str] = None
    club_logo_url: Optional[str] = None
    club_id: Optional[int] = None
    club_name: Optional[str] = None
    club_tagline: Optional[str] = None
    club_description: Optional[str] = None
    club_url: Optional[str] = None
    is_following: Optional[bool] = None


class PersohubPublicClubCommunityInfo(BaseModel):
    clubId: str
    clubName: str
    clubUrl: Optional[str] = None
    clubTagline: Optional[str] = None
    clubImage: Optional[str] = None
    clubDescription: Optional[str] = None


class PersohubMentionResponse(BaseModel):
    user_id: int
    profile_name: str
    name: str


class PersohubAttachmentResponse(BaseModel):
    id: int
    s3_url: str
    preview_image_urls: List[str] = Field(default_factory=list)
    mime_type: Optional[str] = None
    attachment_kind: Optional[str] = None
    size_bytes: Optional[int] = None
    order_no: int


class PersohubCommentResponse(BaseModel):
    id: int
    user_id: int
    profile_name: Optional[str] = None
    name: Optional[str] = None
    image_url: Optional[str] = None
    comment_text: str
    created_at: datetime


class PersohubPostEventInfo(BaseModel):
    id: int
    slug: str
    title: str
    explore_url: str


class PersohubPostResponse(BaseModel):
    id: int
    slug_token: str
    description: Optional[str] = None
    is_hidden: int = 1
    created_at: datetime
    updated_at: Optional[datetime] = None
    post_type: Literal["community", "event"] = "community"
    like_count: int
    comment_count: int
    is_liked: bool = False
    community: PersohubCommunityCard
    attachments: List[PersohubAttachmentResponse] = Field(default_factory=list)
    hashtags: List[str] = Field(default_factory=list)
    mentions: List[PersohubMentionResponse] = Field(default_factory=list)
    event: Optional[PersohubPostEventInfo] = None
    share_url: str


class PersohubFeedResponse(BaseModel):
    items: List[PersohubPostResponse] = Field(default_factory=list)
    next_cursor: Optional[str] = None
    has_more: bool = False


class PersohubCommentPageResponse(BaseModel):
    items: List[PersohubCommentResponse] = Field(default_factory=list)
    next_cursor: Optional[str] = None
    has_more: bool = False


class PersohubSearchSuggestion(BaseModel):
    result_type: Literal["community", "user", "hashtag"]
    profile_name: str
    label: str
    meta: Optional[str] = None


class PersohubSearchResponse(BaseModel):
    items: List[PersohubSearchSuggestion] = Field(default_factory=list)


class PersohubBadgeResponse(BaseModel):
    id: int
    title: str
    image_url: Optional[str] = None
    place: str
    score: Optional[float] = None
    event_id: Optional[int] = None


class PersohubPublicProfileResponse(BaseModel):
    profile_type: Literal["user", "community"]
    profile_name: str
    name: str
    regno: Optional[str] = None
    email: Optional[str] = None
    image_url: Optional[str] = None
    gender: Optional[str] = None
    about: Optional[str] = None
    is_member: Optional[bool] = None
    team: Optional[str] = None
    designation: Optional[str] = None
    instagram_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    follower_count: Optional[int] = None
    registered_events_count: Optional[int] = None
    badges: List[PersohubBadgeResponse] = Field(default_factory=list)
    community: Optional[PersohubCommunityCard] = None
    posts: List[PersohubPostResponse] = Field(default_factory=list)
    posts_next_cursor: Optional[str] = None
    posts_has_more: bool = False
    can_edit: bool = False


class PersohubPhaseGateStatus(BaseModel):
    phase: str
    checks: dict
    status: Literal["pass", "fail"]
