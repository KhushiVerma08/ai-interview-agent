// src/services/teamsService.js
// Microsoft Teams meeting scheduling via Microsoft Graph API
// Requires: Azure App Registration with OnlineMeetings.ReadWrite permission

const fetch   = require("node-fetch");
const logger  = require("../config/logger");

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ─── Get OAuth2 token from Azure AD ──────────────────────────────────────────
async function getAccessToken() {
  const url = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "client_credentials",
      client_id:     process.env.AZURE_CLIENT_ID,
      client_secret: process.env.AZURE_CLIENT_SECRET,
      scope:         "https://graph.microsoft.com/.default",
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get Teams access token: " + JSON.stringify(data));
  return data.access_token;
}

// ─── Create a Teams Online Meeting ───────────────────────────────────────────
async function createTeamsMeeting({ candidateName, role, scheduledAt, durationMinutes = 60 }) {
  if (process.env.TEAMS_ENABLED !== "true") {
    logger.info("Teams disabled — returning mock meeting data");
    return {
      meetingId:  `mock-${Date.now()}`,
      joinUrl:    null, // will use our interview room link instead
      startTime:  scheduledAt || new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      endTime:    new Date((scheduledAt ? new Date(scheduledAt) : Date.now() + 30 * 60 * 1000) + durationMinutes * 60 * 1000).toISOString(),
    };
  }

  try {
    const token = await getAccessToken();
    const start = scheduledAt ? new Date(scheduledAt) : new Date(Date.now() + 30 * 60 * 1000);
    const end   = new Date(start.getTime() + durationMinutes * 60 * 1000);

    const res = await fetch(`${GRAPH_BASE}/users/${process.env.TEAMS_USER_ID}/onlineMeetings`, {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: `AI Interview — ${candidateName} — ${role}`,
        startDateTime: start.toISOString(),
        endDateTime:   end.toISOString(),
        lobbyBypassSettings: {
          scope:            "everyone",
          isDialInBypassEnabled: false,
        },
        allowedPresenters: "organizer",
        recordAutomatically: false, // Recording via bot — see US-AG-06
      }),
    });

    const meeting = await res.json();
    if (!meeting.id) throw new Error("Graph API error: " + JSON.stringify(meeting));

    logger.info("Teams meeting created", { meetingId: meeting.id });
    return {
      meetingId: meeting.id,
      joinUrl:   meeting.joinWebUrl,
      startTime: meeting.startDateTime,
      endTime:   meeting.endDateTime,
    };
  } catch (err) {
    logger.error("Teams meeting creation failed", { error: err.message });
    throw err;
  }
}

// ─── Cancel a Teams meeting ───────────────────────────────────────────────────
async function cancelTeamsMeeting(meetingId) {
  if (process.env.TEAMS_ENABLED !== "true" || !meetingId) return;
  try {
    const token = await getAccessToken();
    await fetch(`${GRAPH_BASE}/users/${process.env.TEAMS_USER_ID}/onlineMeetings/${meetingId}`, {
      method:  "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    logger.info("Teams meeting cancelled", { meetingId });
  } catch (err) {
    logger.warn("Could not cancel Teams meeting", { meetingId, error: err.message });
  }
}

module.exports = { createTeamsMeeting, cancelTeamsMeeting };