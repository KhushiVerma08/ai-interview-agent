import os
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv

load_dotenv()

def send_meeting_invite(to_email: str, candidate_name: str, meeting_link: str, scheduled_at: str, teams_link: str = None):
    if not to_email:
        print("No email provided to send invite to.")
        return

    email_user = os.getenv("EMAIL_USER")
    email_pass = os.getenv("EMAIL_PASS")

    if not email_user or not email_pass:
        print("Email credentials not configured.")
        return

    msg = EmailMessage()
    msg['Subject'] = 'Your Interview is Scheduled!'
    msg['From'] = email_user
    msg['To'] = to_email

    # Convert relative local paths to absolute for the email
    absolute_link = f"http://localhost:3000{meeting_link}" if meeting_link.startswith("/") else meeting_link

    teams_text = f"Join Microsoft Teams Meeting: {teams_link}\n\n(Fallback Web Portal: {absolute_link})" if teams_link else f"Link: {absolute_link}"

    content = f"""Hi {candidate_name},

Your AI interview has been scheduled!

Time: {scheduled_at}

{teams_text}

Please join the link above at the scheduled time to begin your interview.

Good luck!
"""

    msg.set_content(content)

    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
            smtp.login(email_user, email_pass)
            smtp.send_message(msg)
            print(f"Sent meeting invite to {to_email}")
    except Exception as e:
        print(f"Failed to send email to {to_email}: {e}")
