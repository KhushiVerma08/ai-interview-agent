// src/routes/interview.js
// Live interview state machine — all candidate-facing endpoints

const express  = require("express");
const multer   = require("multer");
const path     = require("path");
const fs       = require("fs");
const { v4: uuid } = require("uuid");
const router   = express.Router();

const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { sessionId } = req.body;
    const dir = path.join(process.cwd(), "uploads", "sessions", sessionId || "unknown");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const { sessionId, questionId } = req.body;
    cb(null, `${sessionId}_${questionId}_${Date.now()}.webm`);
  }
});
const uploadAudio = multer({ storage: audioStorage });

const { db, getSession, updateSession, insertAuditLog } = require("../config/db");
const logger     = require("../config/logger");
const claude     = require("../services/claudeService");
const emailSvc   = require("../services/emailService");
const reportSvc  = require("../services/reportService");

const STATUS = {
  WAITING:   "waiting",
  ACTIVE:    "active",
  COMPLETED: "completed",
  NO_SHOW:   "no_show",
};

//  GET /api/interview/session/:id
router.get("/session/:id", async (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Interview session not found." });
    if (session.status === "completed") return res.status(410).json({ error: "This interview has already been completed." });

    const questions = db.prepare("SELECT * FROM questions WHERE session_id = ? ORDER BY question_number ASC").all(req.params.id);

    res.json({
      success: true,
      session: {
        id:             session.id,
        candidateName:  session.candidate_name,
        role:           session.role,
        detectedLevel:  session.detected_level,
        levelReason:    session.level_reason,
        status:         session.status,
        scheduledAt:    session.scheduled_at,
        totalQuestions: questions.length,
      },
      questionTopics: questions.map(q => ({ topic: q.topic, type: q.question_type })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

//  POST /api/interview/start
router.post("/start", async (req, res) => {
  try {
    const { sessionId, qNum } = req.body;
    if (!sessionId || !qNum) return res.status(400).json({ error: "Missing session or question num" });

    const session = getSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Mark as started if first question
    if (qNum === 1 && session.status !== "active") {
      updateSession(sessionId, { status: "active", started_at: new Date().toISOString() });
      insertAuditLog(sessionId, "INTERVIEW_STARTED");
      req.app.get("io")?.to(`session:${sessionId}`).emit("session:update", { status: "active" });
    }

    const question = db.prepare("SELECT * FROM questions WHERE session_id = ? AND question_number = ?").get(sessionId, qNum);
    if (!question) return res.status(404).json({ error: "Question not found" });

    res.json({
      success: true,
      question: {
        number: question.question_number,
        text:   question.question_text,
        type:   question.question_type,
        topic:  question.topic,
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

//  POST /api/interview/consent
router.post("/consent", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const firstQ = db.prepare("SELECT * FROM questions WHERE session_id = ? ORDER BY question_number ASC LIMIT 1").get(sessionId);
    const bridge = await claude.generateConsentBridge(session.candidate_name, firstQ.question_text);

    await insertAuditLog(sessionId, "CONSENT_GIVEN");

    res.json({
      success: true,
      bridge,
      question: {
        id:     firstQ.id,
        number: 1,
        text:   firstQ.question_text,
        type:   firstQ.question_type,
        topic:  firstQ.topic,
        depth:  firstQ.depth,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

//  POST /api/interview/answer
router.post("/answer", async (req, res) => {
  const { sessionId, qNum, qText, answerText, isFollowup = false } = req.body;
  if (!answerText?.trim()) return res.status(400).json({ error: "Answer cannot be empty" });

  try {
    const session = getSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    let question = db.prepare("SELECT * FROM questions WHERE session_id = ? AND question_number = ?").get(sessionId, qNum);
    if (!question) return res.status(404).json({ error: "Question not found" });

    // Ensure scoringCriteria and followupTriggers are objects/arrays
    question.scoring_criteria = question.scoring_criteria ? JSON.parse(question.scoring_criteria) : {};
    question.followup_triggers = question.followup_triggers ? JSON.parse(question.followup_triggers) : [];

    let prevAnswers = db.prepare("SELECT * FROM answers WHERE session_id = ? ORDER BY answered_at DESC LIMIT 3").all(sessionId).reverse();

    const evalData = await claude.evaluateAnswer(
      {
        id:              question.id,
        questionText:    qText,
        type:            question.question_type,
        targetSkill:     question.target_skill,
        followupTriggers: question.followup_triggers || [],
        scoringCriteria:  question.scoring_criteria || {},
      },
      answerText,
      session.detected_level,
      prevAnswers
    );

    const needsFollowup = evalData.needsFollowup;
    const isLast = !evalData.needsFollowup && qNum >= db.prepare("SELECT COUNT(*) as count FROM questions WHERE session_id = ?").get(sessionId).count;

    db.prepare(`
      INSERT INTO answers (
        id, session_id, question_id, question_number, question_text, answer_text,
        is_followup, followup_trigger, technical_score, depth_score, clarity_score, problem_solving_score, overall_score,
        evaluation_note, keywords_detected, needs_followup, followup_question, followup_reason, answered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      uuid(), sessionId, question.id, isFollowup ? null : qNum, qText, answerText,
      isFollowup ? 1 : 0, null,
      evalData.scores.technical, evalData.scores.depth, evalData.scores.clarity, evalData.scores.problemSolving, evalData.overallScore,
      evalData.evaluationNote, JSON.stringify(evalData.keywordsDetected || []),
      needsFollowup ? 1 : 0, evalData.followup?.question || null, evalData.followup?.reason || null
    );

    // Live update HR
    const io = req.app.get("io");
    if (io) {
      io.to(`session:${sessionId}`).emit("interview:score", {
        qNum: isFollowup ? `${qNum}.F` : qNum,
        score: evalData.overallScore,
        note: evalData.evaluationNote,
      });
    }

    if (!needsFollowup && isLast) {
      updateSession(sessionId, { status: "completed" });
      generateReportAsync(sessionId, io); // Fire and forget
    }

    return res.json({
      success:    true,
      evaluation: { score: evalData.overallScore, acknowledgment: evalData.acknowledgment },
      action:     needsFollowup ? "followup" : (isLast ? "complete" : "next"),
      followup:   needsFollowup ? { question: evalData.followup.question, reason: evalData.followup.reason } : null
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/audio", uploadAudio.single("audio"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No audio file provided" });
  
  const { sessionId, qNum, isFollowup } = req.body;
  if (sessionId && qNum) {
    try {
      db.prepare(`
        UPDATE answers 
        SET audio_url = ? 
        WHERE session_id = ? AND question_number = ? AND is_followup = ?
      `).run(req.file.path, sessionId, parseInt(qNum), isFollowup === 'true' ? 1 : 0);
    } catch (err) {
      console.error("Failed to link audio to answer:", err);
    }
  }
  
  res.json({ success: true, path: req.file.path });
});

router.post("/edge-case", async (req, res) => {
  try {
    const response = await claude.generateEdgeCaseResponse(req.body.situation, req.body.questionText);
    res.json({ success: true, response });
  } catch (err) { res.json({ success: true, response: "Take your time — whenever you're ready." }); }
});

router.post("/no-show", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    updateSession(sessionId, { status: "no_show" });
    insertAuditLog(sessionId, "NO_SHOW");
    req.app.get("io")?.to(`session:${sessionId}`).emit("session:update", { status: "no_show" });

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/integrity", async (req, res) => {
  try {
    const { sessionId, eventType, detail } = req.body;
    if (!sessionId) return res.status(400).json({ error: "No session ID provided" });
    insertAuditLog(sessionId, eventType || "INTEGRITY_ALERT", detail || "Candidate switched tabs or minimized window");
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function generateReportAsync(sessionId, io) {
  try {
    logger.info("Generating report...", { sessionId });

    const session   = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    const questions = db.prepare("SELECT * FROM questions WHERE session_id = ? ORDER BY question_number").all(sessionId);
    const answers   = db.prepare("SELECT * FROM answers WHERE session_id = ? ORDER BY rowid").all(sessionId);
    const scores    = answers.filter(a => !a.is_followup);

    const transcript = answers.flatMap(a => [
      { role: "ai", text: a.question_text, timestamp: a.answered_at },
      { role: "candidate", text: a.answer_text || "", timestamp: a.answered_at }
    ]).filter(t => t.text);

    const reportData = await claude.generateFinalReport(session, questions, answers, scores);

    const reportId = uuid();
    db.prepare(`
      INSERT INTO reports (
        id, session_id, overall_score, technical_avg, depth_avg, clarity_avg, problem_solving_avg,
        verdict, verdict_confidence, executive_summary, ai_justification, strengths, gaps,
        stage2_focus_areas, hiring_justification, rejection_rationale, improvement_suggestions,
        transcript, failed_questions, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      reportId, sessionId,
      reportData.overallScore, reportData.technicalAvg, reportData.depthAvg,
      reportData.clarityAvg, reportData.problemSolvingAvg,
      reportData.verdict, reportData.verdictConfidence,
      reportData.executiveSummary, reportData.hiringJustification,
      JSON.stringify(reportData.strengths || []),
      JSON.stringify(reportData.criticalGaps || []),
      JSON.stringify(reportData.stage2FocusAreas || []),
      reportData.hiringJustification,
      reportData.rejectionRationale || null,
      reportData.improvementSuggestions || null,
      JSON.stringify(transcript),
      JSON.stringify(reportData.failedQuestions || [])
    );

    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
    const { pdfPath, htmlPath } = await reportSvc.generateReportPDF(session, report, answers, transcript);

    if (pdfPath) {
      db.prepare("UPDATE reports SET report_pdf_url = ? WHERE id = ?").run(pdfPath, reportId);
    }

    updateSession(sessionId, {
      status:           "completed",
      ended_at:         new Date().toISOString(),
      duration_seconds: session.started_at
        ? Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000)
        : null,
    });

    insertAuditLog(sessionId, "REPORT_GENERATED", `Verdict: ${reportData.verdict}, Score: ${reportData.overallScore}`);
    io?.to(`session:${sessionId}`).emit("session:report_ready", {
      verdict:      reportData.verdict,
      overallScore: reportData.overallScore,
      reportUrl:    `/api/hr/report/${sessionId}`,
    });

    const baseUrl      = process.env.BASE_URL || "http://localhost:3000";
    const pdfBuffer    = pdfPath ? require("fs").readFileSync(pdfPath) : null;
    if (session.recruiter_email) {
      await emailSvc.sendHRReport({
        recruiterEmail: session.recruiter_email,
        candidateName:  session.candidate_name,
        role:           session.role,
        verdict:        reportData.verdict,
        reportUrl:      `${baseUrl}/api/hr/report/${sessionId}`,
        transcriptUrl:  `${baseUrl}/api/hr/transcript/${sessionId}`,
        pdfBuffer,
      });
    }
  } catch (err) {
    logger.error("Async report generation failed", { sessionId, error: err.message });
    updateSession(sessionId, { status: "completed" });
    insertAuditLog(sessionId, "REPORT_FAILED", err.message);
  }
}

module.exports = router;