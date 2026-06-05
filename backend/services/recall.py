import os
import requests

RECALL_API_KEY = os.environ.get("RECALL_API_KEY", "")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "https://your-domain.com") # e.g. ngrok or prod domain

def request_recall_bot(teams_meeting_url: str):
    """
    Sends a POST request to Recall.ai to spawn a bot in the given meeting.
    """
    url = "https://api.recall.ai/api/v1/bot"
    
    payload = {
        "meeting_url": teams_meeting_url,
        "bot_name": "AI Interviewer",
        "webhook_url": f"{APP_BASE_URL}/api/webhook/recall",
        "transcription_options": {
            "provider": "default"
        }
    }
    
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "Authorization": f"Token {RECALL_API_KEY}"
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Failed to spawn Recall bot: {e}")
        return None
