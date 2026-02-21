import json
from datetime import date, datetime, time
from enum import Enum
from typing import List, Optional, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PersohubRefreshRequest(BaseModel):
    refresh_token: str


class PersohubCommunityAuthResponse(BaseModel):
    id: int
    name: str
    profile_id: str
    admin_id: int
    admin_name: Optional[str] = None
    logo_url: Optional[str] = None
    club_id: Optional[int] = None
    club_name: Optional[str] = None
    is_root: bool = False


class PersohubCommunityLoginRequest(BaseModel):
    profile_id: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6)


class PersohubCommunityTokenResponse(BaseModel):
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


class PersohubAdminEventStatusEnum(str, Enum):
    OPEN = "open"
    CLOSED = "closed"


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
    round_count: int = Field(1, ge=1, le=20)
    team_min_size: Optional[int] = Field(None, ge=1, le=100)
    team_max_size: Optional[int] = Field(None, ge=1, le=100)

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
    round_count: Optional[int] = Field(default=None, ge=1, le=20)
    team_min_size: Optional[int] = Field(default=None, ge=1, le=100)
    team_max_size: Optional[int] = Field(default=None, ge=1, le=100)
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


class PersohubAdminEventResponse(BaseModel):
    id: int
    slug: str
    event_code: str
    community_id: int
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
    is_visible: bool = True
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


class PersohubCommentCreateRequest(BaseModel):
    comment_text: str = Field(..., min_length=1, max_length=2000)


class PersohubCommunityCard(BaseModel):
    id: int
    name: str
    profile_id: str
    logo_url: Optional[str] = None
    club_id: Optional[int] = None
    club_name: Optional[str] = None
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


class PersohubPostResponse(BaseModel):
    id: int
    slug_token: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    like_count: int
    comment_count: int
    is_liked: bool = False
    community: PersohubCommunityCard
    attachments: List[PersohubAttachmentResponse] = Field(default_factory=list)
    hashtags: List[str] = Field(default_factory=list)
    mentions: List[PersohubMentionResponse] = Field(default_factory=list)
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
    image_url: Optional[str] = None
    about: Optional[str] = None
    is_member: Optional[bool] = None
    team: Optional[str] = None
    designation: Optional[str] = None
    badges: List[PersohubBadgeResponse] = Field(default_factory=list)
    community: Optional[PersohubCommunityCard] = None
    posts: List[PersohubPostResponse] = Field(default_factory=list)
    can_edit: bool = False


class PersohubPhaseGateStatus(BaseModel):
    phase: str
    checks: dict
    status: Literal["pass", "fail"]
