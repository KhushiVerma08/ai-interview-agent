import os
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv

load_dotenv()

def send_meeting_invite(to_email: str, candidate_name: str, meeting_link: str, scheduled_at: str, teams_link: str = None, role: str = "the position", company_name: str = "Our Company"):
    if not to_email:
        print("No email provided to send invite to.")
        return

    email_user = os.getenv("EMAIL_USER")
    email_pass = os.getenv("EMAIL_PASS")

    if not email_user or not email_pass:
        print("Email credentials not configured.")
        return

    msg = EmailMessage()
    msg['Subject'] = f'Your Interview is Scheduled: {role} at {company_name}'
    msg['From'] = email_user
    msg['To'] = to_email

    from datetime import datetime
    try:
        dt = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))
        friendly_time = dt.strftime("%A, %B %d, %Y at %I:%M %p (IST)")
    except Exception:
        friendly_time = scheduled_at

    # Convert relative local paths to absolute for the email
    absolute_link = f"http://localhost:3000{meeting_link}" if meeting_link.startswith("/") else meeting_link

    teams_text = f"Join Microsoft Teams Meeting: {teams_link}\n\n(Fallback Web Portal: {absolute_link})" if teams_link else f"Link: {absolute_link}"

    content = f"""Dear {candidate_name},

Congratulations! Your profile has been shortlisted for the {role} position at {company_name}, and we would like to invite you for an AI-conducted interview.

Your interview has been scheduled for exactly 30 minutes from now.

Date & Time: {friendly_time}

{teams_text}

Instructions:
- Please ensure you are in a quiet room with a stable internet connection.
- Keep your camera and microphone enabled.
- The interview will begin promptly at the scheduled time. 

Consent Notice: By joining this interview, you consent to your responses being recorded and analyzed by Artificial Intelligence (LLM) models.

Best of luck!
"""

    msg.set_content(content)

    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
            smtp.login(email_user, email_pass)
            smtp.send_message(msg)
            print(f"Sent meeting invite to {to_email}")
    except Exception as e:
        print(f"Failed to send email to {to_email}: {e}")
