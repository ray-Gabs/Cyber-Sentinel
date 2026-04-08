# ============================================================
# backend/core/email_service.py — Unified Async Email Service
# ============================================================
# Single entry point for all outbound emails.
# Uses aiosmtplib (never smtplib) to avoid blocking the event loop.
# All HTML rendering goes through Jinja2 templates in templates/email/.
#
# Usage:
#   from core.email_service import send_email
#   await send_email(
#       to=user.email,
#       subject="...",
#       template="reset_password.html",
#       context={"username": user.username, "reset_url": url},
#       plain_text="Fallback plain text...",
#   )
# ============================================================

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, select_autoescape

from core.config import settings

log = logging.getLogger(__name__)

# Jinja2 environment — templates/email/ relative to backend root
_TEMPLATE_DIR = Path(__file__).parent.parent / "templates"
_jinja_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(["html"]),
)


async def send_email(
    *,
    to: str,
    subject: str,
    template: str,
    context: dict,
    plain_text: str = "",
) -> None:
    """
    Render `template` with `context` and send to `to`.

    Args:
        to:         Recipient email address.
        subject:    Email subject line.
        template:   Template filename relative to templates/email/ (e.g. "reset_password.html").
        context:    Variables passed to the Jinja2 template.
        plain_text: Plain-text fallback body (shown by clients that block HTML).

    Raises:
        RuntimeError: If SMTP is not configured.
        aiosmtplib.SMTPException: On send failure (caller should handle/log).
    """
    if not settings.smtp_host:
        log.warning("SMTP not configured — skipping email to %s (subject: %s)", to, subject)
        raise RuntimeError("SMTP not configured")

    sender = settings.smtp_from or settings.smtp_user

    # Render HTML via Jinja2
    tmpl = _jinja_env.get_template(f"email/{template}")
    html_body = tmpl.render(**context)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Cyber Sentinel <{sender}>"
    msg["To"] = to

    if plain_text:
        msg.attach(MIMEText(plain_text, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_password or None,
        start_tls=settings.smtp_use_tls,
    )
    log.info("Email sent to %s — subject: %s", to, subject)
