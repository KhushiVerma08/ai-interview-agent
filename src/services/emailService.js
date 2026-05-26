// src/services/emailService.js
// Nodemailer email service — invitations, notifications, reports

const nodemailer = require("nodemailer");
const { v4: uuid } = require("uuid");
const logger     = require("../config/logger");

function generateICS(candidateName, role, interviewLink, scheduledAt, durationMinutes) {
  const start = scheduledAt ? new Date(scheduledAt) : new Date(Date.now() + 24 * 60 * 60 * 1000); // default tomorrow
  const end = new Date(start.getTime() + durationMinutes * 60000);
  
  const formatDate = (date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//InterviewAI//EN
BEGIN:VEVENT
UID:${uuid()}@interviewai.local
DTSTAMP:${formatDate(new Date())}
DTSTART:${formatDate(start)}
DTEND:${formatDate(end)}
SUMMARY:AI Interview: ${role} - ${candidateName}
DESCRIPTION:Please join your AI interview using the following link:\\n\\n${interviewLink}\\n\\nEnsure you are in a quiet place and your microphone is working.
ORGANIZER;CN=InterviewAI:MAILTO:no-reply@interviewai.local
END:VEVENT
END:VCALENDAR`;
}

function getTransporter() {
  return nodemailer.createTransport({
    host:   process.env.EMAIL_HOST || "smtp.gmail.com",
    port:   parseInt(process.env.EMAIL_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

async function send(to, subject, html, attachments = []) {
  if (process.env.EMAIL_ENABLED !== "true") {
    logger.info("Email disabled — skipping send", { to, subject });
    return;
  }
  try {
    const t = getTransporter();
    await t.sendMail({
      from:        process.env.EMAIL_FROM || `"InterviewAI" <${process.env.EMAIL_USER}>`,
      to, subject, html, attachments,
    });
    logger.info("Email sent", { to, subject });
  } catch (err) {
    logger.error("Email send failed", { to, error: err.message });
    throw err;
  }
}

// ─── Candidate Invitation ────────────────────────────────────────────────────
async function sendCandidateInvite({ candidateEmail, candidateName, role, interviewLink, scheduledAt, teamsJoinUrl, durationMinutes = 45 }) {
  const timeStr = scheduledAt
    ? new Date(scheduledAt).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })
    : "As soon as you're ready";

  const joinSection = teamsJoinUrl
    ? `<div style="margin:20px 0;padding:16px;background:#f0f4ff;border-radius:8px;border:1px solid #d0d9ff">
        <div style="font-size:12px;color:#6b7280;margin-bottom:8px;font-weight:600">TEAMS MEETING LINK</div>
        <a href="${teamsJoinUrl}" style="color:#6378ff;font-size:14px;word-break:break-all">${teamsJoinUrl}</a>
       </div>`
    : `<div style="margin:20px 0;padding:16px;background:#f0fff8;border-radius:8px;border:1px solid #a7f3d0">
        <div style="font-size:12px;color:#6b7280;margin-bottom:8px;font-weight:600">YOUR INTERVIEW ROOM</div>
        <a href="${interviewLink}" style="color:#059669;font-size:14px;font-weight:500">${interviewLink}</a>
        <div style="font-size:11px;color:#6b7280;margin-top:4px">Click this link to join your interview at the scheduled time</div>
       </div>`;

  const icsContent = generateICS(candidateName, role, interviewLink, scheduledAt, durationMinutes);

  await send(
    candidateEmail,
    `Your AI Interview Invitation — ${role}`,
    `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f4f4f5;margin:0;padding:24px">
<div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">
  <div style="background:#0a0d14;padding:28px 32px">
    <div style="color:#6378ff;font-size:11px;font-weight:600;letter-spacing:1px;margin-bottom:6px">AI INTERVIEW AGENT</div>
    <div style="color:white;font-size:20px;font-weight:300">You have been invited to interview</div>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:14px;color:#374151;line-height:1.7">Hi <strong>${candidateName}</strong>,</p>
    <p style="font-size:14px;color:#374151;line-height:1.7">
      You have been shortlisted for the <strong>${role}</strong> position. Your first-round interview will be conducted by our AI Interview Agent — a conversational AI that will ask you personalised questions based on your experience.
    </p>
    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:20px 0">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:12px;color:#6b7280">Scheduled</span>
        <span style="font-size:13px;font-weight:500;color:#111">${timeStr}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:12px;color:#6b7280">Duration</span>
        <span style="font-size:13px;font-weight:500;color:#111">~${durationMinutes} minutes</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:12px;color:#6b7280">Format</span>
        <span style="font-size:13px;font-weight:500;color:#111">Voice-based AI Interview</span>
      </div>
    </div>
    ${joinSection}
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin-bottom:20px">
      <div style="font-size:11px;font-weight:600;color:#92400e;margin-bottom:6px">BEFORE YOU JOIN</div>
      <ul style="font-size:12px;color:#78350f;margin:0;padding-left:16px;line-height:1.8">
        <li>Use Chrome or Edge browser for best experience</li>
        <li>Allow microphone access when prompted</li>
        <li>Join from a quiet location with good internet</li>
        <li>The interview will be recorded for review</li>
        <li>You will be asked for verbal consent before questions begin</li>
      </ul>
    </div>
    <p style="font-size:12px;color:#9ca3af">This interview is AI-conducted. Your responses will be evaluated automatically and reviewed by our HR team. All data is handled securely and retained for 12 months per our data retention policy.</p>
  </div>
  <div style="background:#f9fafb;padding:14px 32px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #f0f0f0">
    InterviewAI Agent · Confidential · Do not share this link
  </div>
</div>
</body></html>`,
    [{ filename: 'invite.ics', content: icsContent, contentType: 'text/calendar' }]
  );
}

// ─── HR Notification — Meeting Scheduled ─────────────────────────────────────
async function sendHRScheduledNotification({ recruiterEmail, candidateName, role, level, scheduledAt, sessionId, baseUrl }) {
  const dashUrl = `${baseUrl}/dashboard.html?session=${sessionId}`;
  const timeStr = scheduledAt
    ? new Date(scheduledAt).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })
    : "Immediate";

  const levelLabels = { fresher: "Fresher (0–2 yrs)", intermediate: "Intermediate (2–5 yrs)", experienced: "Experienced (5+ yrs)" };

  const icsContent = generateICS(candidateName, role, `${baseUrl}/interview.html?session=${sessionId}`, scheduledAt, 45);

  await send(
    recruiterEmail,
    `[InterviewAI] Interview Scheduled — ${candidateName} for ${role}`,
    `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f4f4f5;margin:0;padding:24px">
<div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">
  <div style="background:#0a0d14;padding:22px 28px">
    <div style="color:#38f0c0;font-size:11px;font-weight:600;letter-spacing:1px">INTERVIEW SCHEDULED ✓</div>
    <div style="color:white;font-size:18px;margin-top:4px">${candidateName} · ${role}</div>
  </div>
  <div style="padding:24px 28px">
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:8px 0;font-size:12px;color:#6b7280">Candidate</td><td style="font-size:13px;font-weight:500">${candidateName}</td></tr>
      <tr><td style="padding:8px 0;font-size:12px;color:#6b7280">Role</td><td style="font-size:13px;font-weight:500">${role}</td></tr>
      <tr><td style="padding:8px 0;font-size:12px;color:#6b7280">AI-Detected Level</td><td style="font-size:13px;font-weight:500">${levelLabels[level] || level}</td></tr>
      <tr><td style="padding:8px 0;font-size:12px;color:#6b7280">Scheduled</td><td style="font-size:13px;font-weight:500">${timeStr}</td></tr>
    </table>
    <div style="margin-top:20px;padding:14px;background:#f0fdf4;border-radius:8px;border:1px solid #a7f3d0">
      <div style="font-size:11px;color:#065f46;font-weight:600;margin-bottom:6px">NO ACTION NEEDED</div>
      <div style="font-size:12px;color:#065f46">The AI Agent will conduct the interview autonomously. You will receive the evaluation report within 10 minutes of completion.</div>
    </div>
    <a href="${dashUrl}" style="display:block;margin-top:20px;text-align:center;background:#6378ff;color:white;text-decoration:none;padding:12px;border-radius:8px;font-size:14px;font-weight:500">View Session Dashboard →</a>
  </div>
</div>
</body></html>`,
    [{ filename: 'invite.ics', content: icsContent, contentType: 'text/calendar' }]
  );
}

// ─── HR Report Delivery ───────────────────────────────────────────────────────
async function sendHRReport({ recruiterEmail, candidateName, role, report, reportUrl, transcriptUrl, pdfBuffer }) {
  const verdictColors = {
    STRONGLY_RECOMMENDED: "#10b981",
    RECOMMENDED:          "#3b82f6",
    NEEDS_FURTHER_REVIEW: "#f59e0b",
    NOT_RECOMMENDED:      "#ef4444",
  };
  const color = verdictColors[report.verdict] || "#6b7280";
  const verdictLabel = (report.verdict || "PENDING").replace(/_/g, " ");

  const scoreBar = (val) => {
    const pct = Math.min(Math.round((val / 10) * 100), 100);
    return `<div style="height:4px;background:#f0f0f0;border-radius:2px;overflow:hidden;margin-top:4px">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:2px"></div></div>`;
  };

  const attachments = pdfBuffer
    ? [{ filename: `interview-report-${candidateName.replace(/\s+/g, "-")}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
    : [];

  await send(
    recruiterEmail,
    `[InterviewAI] Interview Report — ${candidateName} — ${verdictLabel}`,
    `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f4f4f5;margin:0;padding:24px">
<div style="max-width:640px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">
  <div style="background:#0a0d14;padding:28px 32px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
    <div>
      <div style="color:#6378ff;font-size:11px;font-weight:600;letter-spacing:1px;margin-bottom:4px">EVALUATION REPORT</div>
      <div style="color:white;font-size:18px;font-weight:300">${candidateName} · ${role}</div>
    </div>
    <div style="background:${color}22;border:1px solid ${color}55;border-radius:20px;padding:8px 18px;color:${color};font-weight:600;font-size:13px">${verdictLabel}</div>
  </div>
  <div style="padding:28px 32px">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
      ${[["Overall", report.overallScore], ["Technical", report.technicalAvg], ["Communication", report.clarityAvg], ["Depth", report.depthAvg]].map(([l, v]) => `
      <div style="background:#f9fafb;border-radius:8px;padding:12px;text-align:center;border:1px solid #e5e7eb">
        <div style="font-size:22px;font-weight:300;color:${color}">${v}</div>
        <div style="font-size:10px;color:#6b7280;margin-top:2px">${l}</div>
        ${scoreBar(v)}
      </div>`).join("")}
    </div>

    <div style="background:#f8f9ff;border-left:3px solid #6378ff;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:20px">
      <div style="font-size:10px;color:#6378ff;font-weight:600;margin-bottom:6px">AI JUSTIFICATION</div>
      <div style="font-size:13px;color:#1e293b;line-height:1.7">${report.hiringJustification}</div>
    </div>

    ${report.rejectionRationale ? `
    <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin-bottom:20px">
      <div style="font-size:10px;color:#dc2626;font-weight:600;margin-bottom:6px">REJECTION RATIONALE</div>
      <div style="font-size:13px;color:#991b1b;line-height:1.7">${report.rejectionRationale}</div>
    </div>` : ""}

    ${report.strengths?.length ? `
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:8px">STRENGTHS</div>
      ${report.strengths.map(s => `<div style="font-size:12px;color:#374151;padding:4px 0">✓ ${s}</div>`).join("")}
    </div>` : ""}

    ${report.criticalGaps?.length ? `
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:8px">CRITICAL GAPS</div>
      ${report.criticalGaps.map(g => `<div style="font-size:12px;color:#dc2626;padding:4px 0">✗ ${g}</div>`).join("")}
    </div>` : ""}

    ${report.stage2FocusAreas?.length ? `
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:8px">STAGE 2 FOCUS AREAS</div>
      ${report.stage2FocusAreas.map(a => `<div style="font-size:12px;color:#7c3aed;padding:4px 0">→ ${a}</div>`).join("")}
    </div>` : ""}

    <a href="${reportUrl}" style="display:inline-block;background:#6378ff;color:white;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:13px;font-weight:500;margin-right:10px">View Full Report →</a>
    ${transcriptUrl ? `<a href="${transcriptUrl}" style="display:inline-block;background:transparent;color:#6378ff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:13px;border:1px solid #6378ff">Download Transcript</a>` : ""}
  </div>
  <div style="background:#f9fafb;padding:14px 32px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #f0f0f0">
    InterviewAI Agent · Report auto-generated · ${new Date().toLocaleString()}
  </div>
</div>
</body></html>`,
    attachments
  );
}

module.exports = { sendCandidateInvite, sendHRScheduledNotification, sendHRReport };