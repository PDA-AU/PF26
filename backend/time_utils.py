import os
from datetime import datetime
from zoneinfo import ZoneInfo


def _timezone() -> ZoneInfo:
    name = os.environ.get("APP_TIMEZONE", "UTC")
    return ZoneInfo(name)


def now_tz() -> datetime:
    return datetime.now(_timezone())


def ensure_timezone(dt: datetime) -> datetime:
    tz = _timezone()
    if dt.tzinfo is None:
        return dt.replace(tzinfo=tz)
    return dt.astimezone(tz)
