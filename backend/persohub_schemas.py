from datetime import datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, Field


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


class PersohubCommunityLoginRequest(BaseModel):
    profile_id: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6)


class PersohubCommunityTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    community: PersohubCommunityAuthResponse


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
