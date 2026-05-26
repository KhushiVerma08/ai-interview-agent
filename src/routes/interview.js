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
    const dir = path.join(process.cwd(), "uploads", "recordings");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Save as session_id_question_id.webm
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

// ══ State machine states ═══════════════════════════════════════════════════
const STATUS = {
  WAITING:   "waiting",
  ACTIVE:    "active",
  COMPLETED: "completed",
  NO_SHOW:   "no_show",
};

// ════════════════════════════════════════════════════════════════════════════
//  GET /api/interview/session/:id
//  Candidate loads the interview page — get session metadata
// ════════════════════════════════════════════════════════════════════════════
router.get("/session/:id", (req, res) => {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
  if (!session) return res.status(404).json({ error: "Interview session not found." });
  if (session.status === "completed") return res.status(410).json({ error: "This interview has already been completed." });

  const questions = db.prepare("SELECT id, question_number, topic, question_type, depth FROM questions WHERE session_id = ? ORDER BY question_number").all(req.params.id);

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
});

// ════════════════════════════════════════════════════════════════════════════
//  POST /api/interview/start
//  Candidate joins — generate AI opening, return first question
// ════════════════════════════════════════════════════════════════════════════
router.post("/start", async (req, res) => {
  const { sessionId } = req.body;
  const session       = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.status === "completed") return res.status(410).json({ error: "Interview already completed" });

  try {
    const questions = db.prepare("SELECT * FROM questions WHERE session_id = ? ORDER BY question_number").all(sessionId);
    if (!questions.length) return res.status(400).json({ error: "No questions prepared for this session" });

    const firstQ = questions[0];

    // Generate personalised opening
    const opening = await claude.generateOpening(
      session.candidate_name,
      session.role,
      session.detected_level,
      firstQ.question_text
    );

    // Update session status
    updateSession(sessionId, {
      status:     STATUS.ACTIVE,
      started_at: new Date().toISOString(),
    });
    insertAuditLog(sessionId, "INTERVIEW_STARTED");

    // Emit to HR dashboard via Socket.io
    req.app.get("io")?.to(`session:${sessionId}`).emit("session:update", {
      status: "active",
      candidateName: session.candidate_name,
    });

    logger.info("Interview started", { sessionId, candidateName: session.candidate_name });

    res.json({
      success:  true,
      opening,
      question: {
        id:       firstQ.id,
        number:   1,
        text:     firstQ.question_text,
        type:     firstQ.question_type,
        topic:    firstQ.topic,
        depth:    firstQ.depth,
      },
      progress: { current: 1, total: questions.length },
      totalQuestions: questions.length,
    });

  } catch (err) {
    logger.error("/interview/start failed", { sessionId, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  POST /api/interview/consent
//  Candidate gave verbal consent — return bridge + first question
// ════════════════════════════════════════════════════════════════════════════
router.post("/consent", async (req, res) => {
  const { sessionId } = req.body;
  const session       = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });

  try {
    const firstQ = db.prepare("SELECT * FROM questions WHERE session_id = ? ORDER BY question_number LIMIT 1").get(sessionId);
    const bridge = await claude.generateConsentBridge(session.candidate_name, firstQ.question_text);

    insertAuditLog(sessionId, "CONSENT_GIVEN");

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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  POST /api/interview/answer
//  Core: receive answer → evaluate → decide follow-up or next question
// ════════════════════════════════════════════════════════════════════════════
router.post("/answer", async (req, res) => {
  const { sessionId, questionId, answerText, isFollowup = false, followupOf = null } = req.body;

  if (!answerText?.trim()) return res.status(400).json({ error: "Answer cannot be empty" });

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.status !== STATUS.ACTIVE) return res.status(400).json({ error: "Interview not active" });

  const question = db.prepare("SELECT * FROM questions WHERE id = ?").get(questionId);
  if (!question) return res.status(404).json({ error: "Question not found" });

  try {
    // Previous answers for context
    const prevAnswers = db.prepare(
      "SELECT question_text, answer_text FROM answers WHERE session_id = ? ORDER BY rowid DESC LIMIT 3"
    ).all(sessionId).reverse();

    // ── Claude evaluates the answer ───────────────────────────────────────
    const evaluation = await claude.evaluateAnswer(
      {
        id:              question.id,
        questionText:    question.question_text,
        type:            question.question_type,
        targetSkill:     question.target_skill,
        followupTriggers: JSON.parse(question.followup_triggers || "[]"),
        scoringCriteria:  JSON.parse(question.scoring_criteria || "{}"),
      },
      answerText,
      session.detected_level,
      prevAnswers
    );

    // ── Store answer ──────────────────────────────────────────────────────
    const answerId = uuid();
    const followupScore = parseFloat(process.env.FOLLOWUP_SCORE_TRIGGER || "5.0");
    const maxFollowups  = parseInt(process.env.MAX_FOLLOWUPS_PER_QUESTION || "2");

    db.prepare(`
      INSERT INTO answers (
        id, session_id, question_id, question_number, question_text, answer_text,
        is_followup, followup_trigger,
        technical_score, depth_score, clarity_score, problem_solving_score, overall_score,
        evaluation_note, keywords_detected, needs_followup, followup_question, followup_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      answerId, sessionId,
      question.id, question.question_number, question.question_text, answerText,
      isFollowup ? 1 : 0, req.body.followupTrigger || null,
      evaluation.technicalScore, evaluation.depthScore, evaluation.clarityScore,
      evaluation.problemSolvingScore, evaluation.overallScore,
      evaluation.internalNote, JSON.stringify(evaluation.keywordsDetected || []),
      evaluation.needsFollowup ? 1 : 0, evaluation.followupQuestion, evaluation.followupReason,
    );

    // ── Count follow-ups already asked on this question ───────────────────
    const followupCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM answers WHERE session_id = ? AND question_id = ? AND is_followup = 1"
    ).get(sessionId, question.id)?.cnt || 0;

    const shouldFollowup = (
      !isFollowup &&
      evaluation.needsFollowup &&
      evaluation.overallScore < followupScore &&
      followupCount < maxFollowups
    );

    // ── Get all questions to find next ────────────────────────────────────
    const allQuestions = db.prepare("SELECT * FROM questions WHERE session_id = ? ORDER BY question_number").all(sessionId);
    const currentIdx   = allQuestions.findIndex(q => q.id === question.id);
    const nextQuestion = allQuestions[currentIdx + 1] || null;
    const isLast       = !nextQuestion;

    // ── Emit live score update to HR dashboard ────────────────────────────
    req.app.get("io")?.to(`session:${sessionId}`).emit("interview:score", {
      questionNumber: question.question_number,
      score:          evaluation.overallScore,
      technical:      evaluation.technicalScore,
      clarity:        evaluation.clarityScore,
      depth:          evaluation.depthScore,
    });

    // ── Action decision ───────────────────────────────────────────────────
    if (shouldFollowup) {
      insertAuditLog(sessionId, "FOLLOWUP_TRIGGERED", evaluation.followupReason);
      return res.json({
        success:    true,
        evaluation: { score: evaluation.overallScore, acknowledgment: evaluation.acknowledgment },
        action:     "followup",
        followup: {
          question:  evaluation.followupQuestion,
          reason:    evaluation.followupReason,
          trigger:   (evaluation.keywordsDetected || [])[0] || "",
          parentId:  question.id,
        },
        progress: { current: question.question_number, total: allQuestions.length },
      });
    }

    if (isLast) {
      // Trigger async report generation
      setImmediate(() => generateReportAsync(sessionId, req.app.get("io")));
      return res.json({
        success:    true,
        evaluation: { score: evaluation.overallScore, acknowledgment: evaluation.acknowledgment },
        action:     "complete",
        closing:    `${evaluation.acknowledgment} That brings us to the end of our interview, ${session.candidate_name}. Thank you so much for your time. I'm now generating your evaluation report — our HR team will be in touch shortly.`,
        progress:   { current: allQuestions.length, total: allQuestions.length },
      });
    }

    return res.json({
      success:      true,
      evaluation:   { score: evaluation.overallScore, acknowledgment: evaluation.acknowledgment },
      action:       "next",
      nextQuestion: {
        id:     nextQuestion.id,
        number: nextQuestion.question_number,
        text:   nextQuestion.question_text,
        type:   nextQuestion.question_type,
        topic:  nextQuestion.topic,
        depth:  nextQuestion.depth,
      },
      progress: { current: nextQuestion.question_number, total: allQuestions.length },
    });

  } catch (err) {
    logger.error("/interview/answer failed", { sessionId, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  POST /api/interview/audio
//  Candidate uploads raw audio blob for a question (T6.1 fallback)
// ════════════════════════════════════════════════════════════════════════════
router.post("/audio", uploadAudio.single("audio"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No audio file provided" });
  res.json({ success: true, path: req.file.path });
});

// ════════════════════════════════════════════════════════════════════════════
//  POST /api/interview/edge-case
//  Handle silence, "I don't know", confusion
// ════════════════════════════════════════════════════════════════════════════
router.post("/edge-case", async (req, res) => {
  const { situation, questionText } = req.body;
  try {
    const response = await claude.generateEdgeCaseResponse(situation, questionText);
    res.json({ success: true, response });
  } catch (err) {
    res.json({ success: true, response: "Take your time — whenever you're ready." });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  POST /api/interview/no-show
//  Called if candidate doesn't join within X minutes
// ════════════════════════════════════════════════════════════════════════════
router.post("/no-show", async (req, res) => {
  const { sessionId } = req.body;
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });

  updateSession(sessionId, { status: "no_show" });
  insertAuditLog(sessionId, "NO_SHOW");
  req.app.get("io")?.to(`session:${sessionId}`).emit("session:update", { status: "no_show" });

  // TODO: Optionally trigger reschedule email here

  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
//  Async report generation (called after last answer)
// ════════════════════════════════════════════════════════════════════════════
async function generateReportAsync(sessionId, io) {
  try {
    logger.info("Generating report...", { sessionId });

    const session   = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    const questions = db.prepare("SELECT * FROM questions WHERE session_id = ? ORDER BY question_number").all(sessionId);
    const answers   = db.prepare("SELECT * FROM answers WHERE session_id = ? ORDER BY rowid").all(sessionId);
    const scores    = answers.filter(a => !a.is_followup);

    // Build transcript for Claude
    const transcript = answers.map(a => ({
      role: "ai",
      text: a.question_text,
    })).flatMap((q, i) => [q, { role: "candidate", text: answers[i]?.answer_text || "" }]).filter(t => t.text);

    // Claude generates final report
    const reportData = await claude.generateFinalReport(session, questions, answers, scores);

    // Store report
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
      JSON.stringify(reportData.failedQuestions || []),
    );

    // Generate PDF
    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
    const { pdfPath, htmlPath } = await reportSvc.generateReportPDF(session, report, answers, transcript);

    if (pdfPath) {
      db.prepare("UPDATE reports SET report_pdf_url = ? WHERE id = ?").run(pdfPath, reportId);
    }

    // Mark session complete
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

    // Email report to recruiter
    const baseUrl      = process.env.BASE_URL || "http://localhost:3000";
    const pdfBuffer    = pdfPath ? require("fs").readFileSync(pdfPath) : null;
    if (session.recruiter_email) {
      await emailSvc.sendHRReport({
        recruiterEmail: session.recruiter_email,
        candidateName:  session.candidate_name,
        role:           session.role,
        report: {
          ...reportData,
          overall_score: reportData.overallScore,
          technical_avg: reportData.technicalAvg,
          clarity_avg:   reportData.clarityAvg,
          depth_avg:     reportData.depthAvg,
          hiringJustification: reportData.hiringJustification,
          rejectionRationale:  reportData.rejectionRationale,
        },
        reportUrl:     `${baseUrl}/report.html?session=${sessionId}`,
        transcriptUrl: `${baseUrl}/api/hr/transcript/${sessionId}`,
        pdfBuffer,
      });
    }

    logger.info("Report complete and emailed", { sessionId, verdict: reportData.verdict });

  } catch (err) {
    logger.error("Async report generation failed", { sessionId, error: err.message });
    updateSession(sessionId, { status: "completed" });
    insertAuditLog(sessionId, "REPORT_FAILED", err.message);
  }
}

module.exports = router;