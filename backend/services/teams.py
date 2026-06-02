import os
import uuid
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Try to import msal, if it fails, we know we can only use the mock
try:
    import msal
    import requests
    MSAL_AVAILABLE = True
except ImportError:
    MSAL_AVAILABLE = False

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
logger = logging.getLogger(__name__)

# Azure AD Configuration
TENANT_ID = os.getenv("AZURE_TENANT_ID")
CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
USER_ID = os.getenv("AZURE_USER_ID") # The Object ID of the user creating the meeting

def create_teams_meeting(subject: str, start_time_iso: str, duration_minutes: int = 30) -> dict:
    """
    Creates a Microsoft Teams meeting.
    Falls back to a mock link if MSAL isn't installed or credentials are missing.
    """
    # Check if we have real credentials and libraries
    if not (MSAL_AVAILABLE and TENANT_ID and CLIENT_ID and CLIENT_SECRET and USER_ID):
        logger.info("Missing Azure credentials or msal package. Falling back to Mock Teams Service.")
        return _create_mock_teams_meeting(subject, start_time_iso)

    try:
        authority = f"https://login.microsoftonline.com/{TENANT_ID}"
        app = msal.ConfidentialClientApplication(
            CLIENT_ID, authority=authority, client_credential=CLIENT_SECRET
        )
        
        # Get Token
        result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
        if "access_token" not in result:
            logger.error("Failed to acquire token from MS Graph. Falling back to mock.")
            return _create_mock_teams_meeting(subject, start_time_iso)
            
        token = result["access_token"]
        
        # Parse start time and calculate end time
        start_dt = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00"))
        end_dt = start_dt + timedelta(minutes=duration_minutes)
        
        # Create meeting payload
        url = f"https://graph.microsoft.com/v1.0/users/{USER_ID}/onlineMeetings"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {
            "startDateTime": start_dt.isoformat(),
            "endDateTime": end_dt.isoformat(),
            "subject": subject
        }
        
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        
        meeting_data = response.json()
        return {
            "joinUrl": meeting_data.get("joinWebUrl"),
            "meetingId": meeting_data.get("id"),
            "isMock": False
        }
        
    except Exception as e:
        logger.error(f"Error creating real Teams meeting: {str(e)}. Falling back to mock.")
        return _create_mock_teams_meeting(subject, start_time_iso)


def _create_mock_teams_meeting(subject: str, start_time_iso: str) -> dict:
    """Generates a realistic looking fake Teams link for testing purposes."""
    mock_id = str(uuid.uuid4())
    mock_thread = f"19:meeting_{uuid.uuid4().hex[:20]}@thread.v2"
    mock_url = f"https://teams.microsoft.com/l/meetup-join/{mock_thread}/0?context=%7b%22Tid%22%3a%22mock-tenant-id%22%2c%22Oid%22%3a%22mock-user-id%22%7d"
    
    return {
        "joinUrl": mock_url,
        "meetingId": mock_id,
        "isMock": True
    }
