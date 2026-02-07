import os
import smtplib
import ssl
import logging
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class SMTPConfig:
    host: str
    port: int
    user: Optional[str]
    password: Optional[str]
    use_tls: bool
    use_ssl: bool
    sender: str


def _bool_env(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _load_smtp(prefix: str) -> Optional[SMTPConfig]:
    host = os.environ.get(f"{prefix}_HOST")
    port_raw = os.environ.get(f"{prefix}_PORT")
    sender = os.environ.get(f"{prefix}_FROM")
    if not host or not port_raw or not sender:
        return None

    try:
        port = int(port_raw)
    except ValueError:
        raise RuntimeError(f"Invalid {prefix}_PORT: {port_raw}")

    return SMTPConfig(
        host=host,
        port=port,
        user=os.environ.get(f"{prefix}_USER"),
        password=os.environ.get(f"{prefix}_PASS"),
        use_tls=_bool_env(os.environ.get(f"{prefix}_TLS"), default=True),
        use_ssl=_bool_env(os.environ.get(f"{prefix}_SSL"), default=False),
        sender=sender,
    )


def _send_via_config(config: SMTPConfig, to_email: str, subject: str, html: str, text: str) -> None:
    message = EmailMessage()
    message["From"] = config.sender
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(text)
    message.add_alternative(html, subtype="html")

    if config.use_ssl:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(config.host, config.port, context=context, timeout=20) as server:
            if config.user and config.password:
                server.login(config.user, config.password)
            server.send_message(message)
        return

    with smtplib.SMTP(config.host, config.port, timeout=20) as server:
        server.ehlo()
        if config.use_tls:
            context = ssl.create_default_context()
            server.starttls(context=context)
            server.ehlo()
        if config.user and config.password:
            server.login(config.user, config.password)
        server.send_message(message)


def send_email(to_email: str, subject: str, html: str, text: str) -> None:
    primary = _load_smtp("SMTP_PRIMARY")
    secondary = _load_smtp("SMTP_SECONDARY")
    if not primary:
        raise RuntimeError("SMTP_PRIMARY configuration missing")

    try:
        _send_via_config(primary, to_email, subject, html, text)
        return
    except Exception as exc:
        logger.warning("Primary SMTP failed, attempting secondary: %s", exc)

    if not secondary:
        raise RuntimeError("Primary SMTP failed and SMTP_SECONDARY configuration missing")

    _send_via_config(secondary, to_email, subject, html, text)
    logger.info("Email sent via secondary SMTP")
