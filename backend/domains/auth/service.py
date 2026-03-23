# ============================================================
# backend/domains/auth/service.py — Auth Business Logic
# ============================================================

import logging
from datetime import datetime, timezone, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib
from fastapi import HTTPException, status
from jose import JWTError

from core.config import settings
from core.security import hash_password, verify_password, create_access_token, decode_access_token
from domains.auth.models import User
from domains.auth.schemas import RegisterRequest, LoginRequest, TokenResponse

log = logging.getLogger(__name__)


async def register_user(data: RegisterRequest) -> User:
    """
    Create a new user. Raises 409 if username or email already exists.
    """
    # Check for duplicates
    existing = await User.find_one(
        {"$or": [{"username": data.username}, {"email": data.email}]}
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already registered",
        )

    user = User(
        username=data.username,
        email=data.email,
        hashed_password=hash_password(data.password),
    )
    await user.insert()
    return user


async def authenticate_user(data: LoginRequest) -> TokenResponse:
    """
    Verify credentials and return a JWT.
    Raises 401 on bad username or password.
    """
    user = await User.find_one({"username": data.username})
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Update last_login timestamp
    user.last_login = datetime.now(timezone.utc)
    await user.save()

    token = create_access_token(data={"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token)


# --------------- Password Reset ---------------

def _create_reset_token(user_id: str) -> str:
    """Create a short-lived JWT for password reset (15 min)."""
    return create_access_token(
        data={"sub": user_id, "purpose": "password_reset"},
        expires_delta=timedelta(minutes=15),
    )


async def _send_reset_email(to_email: str, username: str, reset_url: str) -> None:
    """
    Send the password reset email via SMTP (async — does not block the event loop).
    Raises HTTP 503 if SMTP is not configured, 502 if the send fails.
    """
    if not settings.smtp_host:
        log.warning("SMTP not configured — cannot send reset email to %s", to_email)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email service is not configured. Contact your administrator.",
        )

    sender = settings.smtp_from or settings.smtp_user

    plain_text = (
        f"Hi {username},\n\n"
        f"You requested a password reset for your Cyber Sentinel account.\n\n"
        f"Reset your password here (expires in 15 minutes):\n{reset_url}\n\n"
        f"If you didn't request this, you can safely ignore this email — "
        f"your password will not be changed.\n\n"
        f"— The Cyber Sentinel Team"
    )

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0f1a;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0f1a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">

          <!-- Logo / Brand -->
          <tr>
            <td style="padding-bottom:24px;" align="center">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#0ea5e9,#2563eb);width:36px;height:36px;border-radius:8px;text-align:center;vertical-align:middle;">
                    <span style="color:#fff;font-size:18px;font-weight:900;line-height:36px;">&#9650;</span>
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="color:#f1f5f9;font-size:18px;font-weight:700;letter-spacing:-0.3px;">Cyber Sentinel</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#111827;border:1px solid #1e293b;border-radius:16px;overflow:hidden;">

              <!-- Blue top bar -->
              <tr>
                <td style="height:3px;background:linear-gradient(90deg,#0ea5e9,#2563eb,transparent);line-height:3px;font-size:0;">&nbsp;</td>
              </tr>

              <!-- Card body -->
              <tr>
                <td style="padding:36px 40px;">

                  <!-- Heading -->
                  <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f1f5f9;letter-spacing:-0.4px;">
                    Reset your password
                  </p>
                  <p style="margin:0 0 28px;font-size:14px;color:#94a3b8;line-height:1.6;">
                    Hi <strong style="color:#e2e8f0;">{username}</strong>, we received a request to reset the
                    password for your Cyber Sentinel account.
                  </p>

                  <!-- CTA Button -->
                  <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                    <tr>
                      <td style="background:linear-gradient(135deg,#0ea5e9,#2563eb);border-radius:10px;">
                        <a href="{reset_url}"
                           style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;
                                  color:#ffffff;text-decoration:none;letter-spacing:-0.2px;">
                          Reset Password &rarr;
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Expiry notice -->
                  <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;width:100%;">
                    <tr>
                      <td style="background-color:#0f1f2e;border:1px solid #1e3a4a;border-radius:8px;padding:12px 16px;">
                        <p style="margin:0;font-size:13px;color:#7dd3fc;">
                          &#9201;&nbsp; This link expires in <strong>15 minutes</strong>.
                          If it expires, you can request a new one from the login page.
                        </p>
                      </td>
                    </tr>
                  </table>

                  <!-- Fallback URL -->
                  <p style="margin:0 0 8px;font-size:12px;color:#64748b;">
                    If the button above doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="margin:0 0 24px;font-size:11px;color:#475569;word-break:break-all;
                             font-family:'Courier New',Courier,monospace;background:#0d1117;
                             border:1px solid #1e293b;border-radius:6px;padding:10px 12px;">
                    {reset_url}
                  </p>

                  <!-- Security note -->
                  <p style="margin:0;font-size:12px;color:#64748b;line-height:1.6;">
                    If you didn't request a password reset, no action is needed —
                    your account is safe and your password has not been changed.
                  </p>

                </td>
              </tr>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0;text-align:center;">
              <p style="margin:0;font-size:11px;color:#374151;">
                Cyber Sentinel &mdash; AI-Powered Pentesting &amp; SOC Platform
              </p>
              <p style="margin:4px 0 0;font-size:11px;color:#1f2937;">
                This is an automated message. Please do not reply.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reset your Cyber Sentinel password"
    msg["From"] = f"Cyber Sentinel <{sender}>"
    msg["To"] = to_email
    msg.attach(MIMEText(plain_text, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user or None,
            password=settings.smtp_password or None,
            start_tls=settings.smtp_use_tls,
        )
        log.info("Password reset email sent to %s", to_email)
    except Exception as e:
        log.error("Failed to send reset email to %s: %s", to_email, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send reset email. Try again later.",
        )


async def request_password_reset(email: str) -> None:
    """
    Generate a reset token and email it.
    Always returns success (even if email not found) to prevent user enumeration.
    """
    user = await User.find_one({"email": email})
    if not user:
        return  # Silent — don't reveal whether email exists

    token = _create_reset_token(str(user.id))
    reset_url = f"{settings.frontend_url}/reset-password?token={token}"
    await _send_reset_email(user.email, user.username, reset_url)


async def reset_password(token: str, new_password: str) -> None:
    """Validate the reset token and update the user's password."""
    try:
        payload = decode_access_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link. Please request a new one.",
        )

    if payload.get("purpose") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token.",
        )

    user = await User.get(payload["sub"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    user.hashed_password = hash_password(new_password)
    await user.save()
