import html as html_lib
import re
from datetime import date, datetime
from typing import Any, Dict, Iterable


TAG_PATTERN = re.compile(r"<([a-z0-9_]+)>", re.IGNORECASE)
MUSTACHE_PATTERN = re.compile(r"\{\{\s*([a-z0-9_]+)\s*\}\}", re.IGNORECASE)

ALLOWED_TAGS = {
    "name",
    "profile_name",
    "regno",
    "email",
    "dept",
    "gender",
    "phno",
    "dob",
    "team",
    "designation",
    "instagram_url",
    "linkedin_url",
    "github_url",
    "resume_url",
    "photo_url",
    "is_member",
    "is_applied",
    "email_verified",
    "preferred_team",
    "preferred_team_1",
    "preferred_team_2",
    "preferred_team_3",
    "created_at",
    "updated_at",
    "status",
    "batch",
    "regno_or_code",
    "referral_code",
    "referred_by",
    "referral_count",
    "entity_id",
    "participant_id",
    "entity_type",
    "team_name",
    "team_code",
    "members_count",
    "leader_name",
    "leader_regno",
    "leader_email",
    "leader_profile_name",
    "leader_dept",
    "leader_phno",
    "leader_gender",
    "leader_batch",
    "event_title",
    "event_code",
    "rank",
    "cumulative_score",
    "attendance_count",
    "rounds_participated",
}


def extract_batch(regno: Any) -> str:
    value = str(regno or "").strip()
    if len(value) >= 4 and value[:4].isdigit():
        return value[:4]
    return ""


def _normalize_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def render_email_template(template: str, context: Dict[str, Any], *, html_mode: bool) -> str:
    if not template:
        return ""

    def repl(match: re.Match) -> str:
        tag = match.group(1).lower()
        if tag not in ALLOWED_TAGS:
            return match.group(0)
        value = _normalize_value(context.get(tag))
        if html_mode:
            return html_lib.escape(value)
        return value

    rendered = TAG_PATTERN.sub(repl, template)
    return MUSTACHE_PATTERN.sub(repl, rendered)


def derive_text_from_html(html: str) -> str:
    if not html:
        return ""
    text = re.sub(r"<\s*br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"<\s*/p\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html_lib.unescape(text)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text)
    return text.strip()


def available_tags() -> Iterable[str]:
    return sorted(ALLOWED_TAGS)
