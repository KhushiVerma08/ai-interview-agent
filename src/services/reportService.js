// src/services/reportService.js
// Generates a polished PDF evaluation report using Puppeteer

const path   = require("path");
const fs     = require("fs");
const logger = require("../config/logger");

const REPORTS_DIR = path.join(__dirname, "../../reports");
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

function verdictColor(verdict) {
  return {
    STRONGLY_RECOMMENDED: "#10b981",
    RECOMMENDED:          "#3b82f6",
    NEEDS_FURTHER_REVIEW: "#f59e0b",
    NOT_RECOMMENDED:      "#ef4444",
  }[verdict] || "#6b7280";
}

function scoreColor(score) {
  if (score >= 7) return "#10b981";
  if (score >= 5) return "#f59e0b";
  return "#ef4444";
}

function bar(score, color) {
  return `<div style="height:5px;background:#f0f0f0;border-radius:3px;overflow:hidden;margin-top:6px">
    <div style="height:100%;width:${Math.min(score * 10, 100)}%;background:${color};border-radius:3px"></div>
  </div>`;
}

function buildReportHTML(session, report, answers, transcript) {
  const vc = verdictColor(report.verdict);
  const verdictLabel = (report.verdict || "PENDING").replace(/_/g, " ");
  const duration = session.duration_seconds ? `${Math.floor(session.duration_seconds / 60)} min ${session.duration_seconds % 60} sec` : "—";

  const qaRows = (answers || []).filter(a => !a.is_followup).map((a, i) => {
    const sc = scoreColor(a.overall_score || 0);
    return `
    <div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid #f0f0f0">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:6px">
        <span style="background:#f0f0f5;color:#6b7280;font-size:10px;padding:2px 8px;border-radius:10px;white-space:nowrap;margin-top:2px">Q${i + 1}</span>
        <span style="font-size:13px;font-weight:500;color:#111">${a.question_text || "—"}</span>
      </div>
      <div style="font-size:12px;color:#4b5563;line-height:1.6;margin:6px 0 6px 30px;font-style:italic">"${(a.answer_text || "No answer recorded").substring(0, 350)}${(a.answer_text || "").length > 350 ? "…" : ""}"</div>
      ${a.is_followup_answered ? `<div style="font-size:11px;color:#9333ea;margin:4px 0 4px 30px">↳ Follow-up was asked on this answer</div>` : ""}
      <div style="display:flex;align-items:center;gap:10px;margin-left:30px">
        <div style="flex:1;height:3px;background:#f0f0f0;border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${Math.min((a.overall_score || 0) * 10, 100)}%;background:${sc};border-radius:2px"></div>
        </div>
        <span style="font-size:12px;font-weight:500;color:${sc}">${(a.overall_score || 0).toFixed(1)}/10</span>
      </div>
      ${a.evaluation_note ? `<div style="font-size:11px;color:#9ca3af;margin:4px 0 0 30px">Note: ${a.evaluation_note}</div>` : ""}
    </div>`;
  }).join("");

  const transcriptRows = (transcript || []).map(t => {
    const isAI = t.role === "ai";
    return `<div style="margin-bottom:8px"><span style="font-size:10px;font-weight:600;color:${isAI ? "#6378ff" : "#059669"}">${isAI ? "AI" : "CANDIDATE"}</span>: <span style="font-size:11px;color:#374151">${t.text}</span></div>`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; background: white; }
  .page { padding: 36px 40px; max-width: 820px; margin: 0 auto; }
  h2 { font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: .7px; margin-bottom: 12px; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; }
  .header h1 { font-size: 22px; font-weight: 300; letter-spacing: -.5px; color: #111; }
  .header p { font-size: 12px; color: #6b7280; margin-top: 4px; }
  .verdict { padding: 8px 18px; border-radius: 20px; font-size: 13px; font-weight: 600; background: ${vc}15; color: ${vc}; border: 1px solid ${vc}44; }
  .scores { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .score-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; text-align: center; }
  .score-card .num { font-size: 26px; font-weight: 300; }
  .score-card .lbl { font-size: 10px; color: #6b7280; margin-top: 2px; }
  .score-card .wt  { font-size: 9px; color: #9ca3af; }
  .section { border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; margin-bottom: 14px; }
  .box { border-radius: 8px; padding: 14px; margin-bottom: 10px; }
  .box-blue { background: #f0f4ff; border: 1px solid #c7d2fe; }
  .box-red  { background: #fff5f5; border: 1px solid #fecaca; }
  .box-green{ background: #f0fdf4; border: 1px solid #a7f3d0; }
  .box-amber{ background: #fffbeb; border: 1px solid #fde68a; }
  .str-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
  .transcript-box { background: #f9fafb; border-radius: 8px; padding: 14px; max-height: 300px; overflow: hidden; }
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div style="background:#0a0d14;padding:24px 28px;border-radius:10px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="color:#6378ff;font-size:10px;font-weight:600;letter-spacing:1px;margin-bottom:4px">AI INTERVIEW AGENT · EVALUATION REPORT</div>
      <div style="color:white;font-size:18px;font-weight:300">${session.candidate_name} — ${session.role}</div>
      <div style="color:#7880a0;font-size:12px;margin-top:3px">Session ${session.id.substring(0, 8)} · ${new Date(report.generated_at || Date.now()).toLocaleDateString("en-IN", { dateStyle: "long" })}</div>
    </div>
    <div style="background:${vc}22;border:1px solid ${vc}55;border-radius:20px;padding:8px 16px;color:${vc};font-weight:600;font-size:12px">${verdictLabel}</div>
  </div>

  <!-- Meta info -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
    ${[["Candidate", session.candidate_name], ["Role", session.role], ["Level", (session.detected_level || "").charAt(0).toUpperCase() + (session.detected_level || "").slice(1)], ["Duration", duration]].map(([l, v]) => `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px">
      <div style="font-size:10px;color:#9ca3af;margin-bottom:3px">${l.toUpperCase()}</div>
      <div style="font-size:13px;font-weight:500">${v}</div>
    </div>`).join("")}
  </div>

  <!-- Scores -->
  <div class="scores">
    ${[["Overall", report.overall_score, vc], ["Technical (40%)", report.technical_avg, scoreColor(report.technical_avg)], ["Clarity (20%)", report.clarity_avg, scoreColor(report.clarity_avg)], ["Depth (30%)", report.depth_avg, scoreColor(report.depth_avg)]].map(([l, v, c]) => `
    <div class="score-card">
      <div class="num" style="color:${c}">${(v || 0).toFixed(1)}</div>
      <div class="lbl">${l}</div>
      ${bar(v || 0, c)}
    </div>`).join("")}
  </div>

  <!-- AI Justification -->
  <div class="section">
    <h2>AI Recommendation</h2>
    <div class="box box-blue" style="font-size:13px;line-height:1.7;color:#1e293b">${report.ai_justification || report.hiring_justification || "—"}</div>
    ${report.rejection_rationale ? `<div class="box box-red" style="font-size:13px;line-height:1.7;color:#991b1b"><strong>Rejection Rationale:</strong><br>${report.rejection_rationale}</div>` : ""}
  </div>

  <!-- Strengths & Gaps -->
  <div class="section">
    <h2>Strengths & Critical Gaps</h2>
    <div class="str-grid">
      <div class="box box-green">
        <div style="font-size:11px;font-weight:600;color:#065f46;margin-bottom:8px">✓ STRENGTHS</div>
        ${(JSON.parse(report.strengths || "[]")).map(s => `<div style="font-size:12px;color:#047857;padding:3px 0">• ${s}</div>`).join("") || "<div style='font-size:12px;color:#9ca3af'>None noted</div>"}
      </div>
      <div class="box box-red">
        <div style="font-size:11px;font-weight:600;color:#991b1b;margin-bottom:8px">✗ CRITICAL GAPS</div>
        ${(JSON.parse(report.gaps || "[]")).map(g => `<div style="font-size:12px;color:#dc2626;padding:3px 0">• ${g}</div>`).join("") || "<div style='font-size:12px;color:#9ca3af'>None noted</div>"}
      </div>
    </div>
    ${JSON.parse(report.stage2_focus_areas || "[]").length ? `
    <div class="box box-amber" style="margin-top:10px">
      <div style="font-size:11px;font-weight:600;color:#92400e;margin-bottom:8px">→ STAGE 2 FOCUS AREAS</div>
      ${(JSON.parse(report.stage2_focus_areas || "[]")).map(a => `<div style="font-size:12px;color:#78350f;padding:3px 0">→ ${a}</div>`).join("")}
    </div>` : ""}
  </div>

  <!-- Q&A Breakdown -->
  <div class="section">
    <h2>Question-by-Question Breakdown</h2>
    ${qaRows || "<div style='color:#9ca3af;font-size:13px'>No answers recorded</div>"}
  </div>

  <!-- Transcript -->
  ${transcript && transcript.length ? `
  <div class="section">
    <h2>Interview Transcript (Excerpt)</h2>
    <div class="transcript-box">${transcriptRows}</div>
  </div>` : ""}

  <div class="footer">
    InterviewAI Agent · Session ${session.id} · Generated ${new Date().toLocaleString()} · Confidential — Authorised HR Only · Data retained 12 months
  </div>
</div>
</body></html>`;
}

async function generateReportPDF(session, report, answers, transcript) {
  const html     = buildReportHTML(session, report, answers, transcript);
  const htmlPath = path.join(REPORTS_DIR, `${session.id}.html`);
  const pdfPath  = path.join(REPORTS_DIR, `${session.id}.pdf`);

  // Save HTML (always)
  fs.writeFileSync(htmlPath, html);

  // Try Puppeteer PDF
  try {
    const puppeteer = require("puppeteer");
    const browser   = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page      = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" }, printBackground: true });
    await browser.close();
    fs.writeFileSync(pdfPath, pdfBuffer);
    logger.info("Report PDF generated", { sessionId: session.id, pdfPath });
    return { pdfPath, htmlPath, pdfBuffer };
  } catch (err) {
    logger.warn("Puppeteer PDF generation failed — HTML report available", { error: err.message });
    return { pdfPath: null, htmlPath, pdfBuffer: null };
  }
}

module.exports = { generateReportPDF, buildReportHTML };