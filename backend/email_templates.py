from typing import Tuple


def build_verification_email(verify_url: str, validity_hours: int = 24) -> Tuple[str, str, str]:
    subject = "Verify your email address for PDA"
    text = (
        "Hello,\n\n"
        "Thank you for registering with PDA. Please verify your email address using the link below:\n"
        f"{verify_url}\n\n"
        f"This link is valid for {validity_hours} hours.\n\n"
        "If you did not request this, you can safely ignore this email.\n\n"
        "Regards,\n"
        "PDA WEB TEAM\n"
        "Personality Development Association\n"
        "Madras Institute of Technology, Chennai-600044.\n"
    )
    html = f"""
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1b1f24;">
        <div style="max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e6e6e6; border-radius: 12px;">
          <h2 style="margin-top: 0;">Verify your email address</h2>
          <p>Hello,</p>
          <p>Thank you for registering with PDA. Please verify your email address using the button below.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="{verify_url}" style="display:inline-block;padding:12px 18px;background:#11131a;color:#fff;text-decoration:none;border-radius:6px;">Verify Email</a>
          </p>
          <p>This verification link is valid for <strong>{validity_hours} hours</strong>.</p>
          <p>If the button doesn't work, copy and paste this URL into your browser:</p>
          <p style="word-break: break-all;">{verify_url}</p>
          <hr style="border: none; border-top: 1px solid #e6e6e6; margin: 24px 0;" />
          <p style="margin-bottom: 0;">Regards,<br><strong>PDA WEB TEAM</strong><br>Personality Development Association<br>Madras Institute of Technology, Chennai-600044.</p>
        </div>
      </body>
    </html>
    """
    return subject, html, text


def build_reset_email(reset_url: str, validity_minutes: int = 30) -> Tuple[str, str, str]:
    subject = "Reset your PDA password"
    text = (
        "Hello,\n\n"
        "We received a request to reset your PDA account password. Use the link below to proceed:\n"
        f"{reset_url}\n\n"
        f"This link is valid for {validity_minutes} minutes.\n\n"
        "If you did not request this, you can safely ignore this email.\n\n"
        "Regards,\n"
        "PDA WEB TEAM\n"
        "Personality Development Association\n"
        "Madras Institute of Technology, Chennai-600044.\n"
    )
    html = f"""
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1b1f24;">
        <div style="max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e6e6e6; border-radius: 12px;">
          <h2 style="margin-top: 0;">Reset your password</h2>
          <p>Hello,</p>
          <p>We received a request to reset your PDA account password. Click the button below to continue.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="{reset_url}" style="display:inline-block;padding:12px 18px;background:#11131a;color:#fff;text-decoration:none;border-radius:6px;">Reset Password</a>
          </p>
          <p>This reset link is valid for <strong>{validity_minutes} minutes</strong>.</p>
          <p>If the button doesn't work, copy and paste this URL into your browser:</p>
          <p style="word-break: break-all;">{reset_url}</p>
          <hr style="border: none; border-top: 1px solid #e6e6e6; margin: 24px 0;" />
          <p style="margin-bottom: 0;">Regards,<br><strong>PDA WEB TEAM</strong><br>Personality Development Association<br>Madras Institute of Technology, Chennai-600044.</p>
        </div>
      </body>
    </html>
    """
    return subject, html, text
