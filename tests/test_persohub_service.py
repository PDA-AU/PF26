from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from persohub_service import extract_hashtags, normalize_profile_name
from persohub_service import infer_attachment_kind


def test_normalize_profile_name():
    assert normalize_profile_name("John Doe") == "john_doe"
    assert normalize_profile_name("__A__") == "user_a"
    assert normalize_profile_name("!@#") == "user"


def test_extract_hashtags_unique_and_normalized():
    text = "Hello #PDA #pda #Web_Team and #2026"
    assert extract_hashtags(text) == ["pda", "web_team", "2026"]


def test_infer_attachment_kind():
    assert infer_attachment_kind("image/png") == "image"
    assert infer_attachment_kind("video/mp4") == "video"
    assert infer_attachment_kind("audio/mpeg") == "audio"
    assert infer_attachment_kind("application/pdf") == "pdf"
    assert infer_attachment_kind("text/plain") == "text"
    assert infer_attachment_kind(None, "https://x/file.mp3") == "audio"
