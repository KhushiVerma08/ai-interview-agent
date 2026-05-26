// ═══════════════════════════════════════════════════════════════
//  AI Interview Agent — Server
//  Run:  node server.js
//  Requires: ANTHROPIC_API_KEY in .env
// ═══════════════════════════════════════════════════════════════

require("dotenv").config();
const express     = require("express");
const multer      = require("multer");
const cors        = require("cors");
const path        = require("path");
const fs          = require("fs");
const { v4: uuid } = require("uuid");
const Anthropic   = require("@anthropic-ai/sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pdfParse    = require("pdf-parse");
const mammoth     = require("mammoth");
const nodemailer  = require("nodemailer");

const { db } = require("./src/config/db");
const hrRoutes = require("./src/routes/hr");
const interviewRoutes = require("./src/routes/interview");
const emailService = require("./src/services/emailService");

const app    = express();
const PORT   = process.env.PORT || 3000;

// Setup API clients
let anthropicClient = null;
if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
  anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

let geminiClient = null;
if (process.env.GEMINI_API_KEY) {
  geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ── File upload ───────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, "uploads/"),
  filename:    (_, file, cb) => cb(null, uuid() + path.extname(file.originalname)),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx", ".txt"];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

// ── In-memory session store (use Redis/DB in production) ──────
const sessions = new Map();

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buf = fs.readFileSync(filePath);

  try {
    if (ext === ".pdf") {
      const data = await pdfParse(buf);
      return data.text;
    }
    if (ext === ".docx" || ext === ".doc") {
      const result = await mammoth.extractRawText({ buffer: buf });
      return result.value;
    }
    if (ext === ".txt") {
      return buf.toString("utf-8");
    }
  } catch (err) {
    throw new Error(`Failed to parse file: The file may be corrupted or password-protected.`);
  }
  return "";
}

async function callClaude(messages, systemPrompt, maxTokens = 1500) {
  if (anthropicClient) {
    const response = await anthropicClient.messages.create({
      model:      "claude-3-5-sonnet-20241022",
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages,
    });
    return response.content[0].text;
  } else if (geminiClient) {
    const model = geminiClient.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: systemPrompt });
    const prompt = messages.map(m => m.role + ": " + m.content).join("\\n");
    const result = await model.generateContent(prompt);
    return result.response.text();
  } else {
    throw new Error("No AI API configured. Please provide ANTHROPIC_API_KEY or GEMINI_API_KEY in .env");
  }
}

function parseJSON(text) {
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
}

function cleanupFile(filePath) {
  try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); }
  catch {}
}

// ═══════════════════════════════════════════════════════════════
//  ROUTE 1 — Upload JD + Resume  →  Analyse & categorise
// ═══════════════════════════════════════════════════════════════
app.post("/api/analyse",
  upload.fields([{ name: "resume" }, { name: "jd" }]),
  async (req, res) => {
    let resumePath, jdPath;
    try {
      // --- Extract text from uploaded files or body text ---
      let resumeText = req.body.resumeText || "";
      let jdText     = req.body.jdText     || "";

      if (req.files?.resume?.[0]) {
        if (req.files.resume[0].size > 5 * 1024 * 1024) {
          return res.status(400).json({ error: "Limit exceeded: Resume must be under 5MB." });
        }
        resumePath  = req.files.resume[0].path;
        resumeText  = await extractText(resumePath);
      }
      if (req.files?.jd?.[0]) {
        if (req.files.jd[0].size > 10 * 1024 * 1024) {
          return res.status(400).json({ error: "Limit exceeded: JD must be under 10MB." });
        }
        jdPath  = req.files.jd[0].path;
        jdText  = await extractText(jdPath);
      }

      if (!resumeText && !jdText) {
        return res.status(400).json({ error: "Please upload at least a resume or JD." });
      }

      const role          = req.body.role          || "Software Engineer";
      const questionCount = parseInt(req.body.questionCount) || 7;
      const recruiterEmail= req.body.recruiterEmail || "";

      // --- AI: Analyse resume + JD ---
      const analysisRaw = await callClaude(
        [{
          role: "user",
          content: `Analyse this resume against the job description. Return ONLY valid JSON, no markdown.

JOB DESCRIPTION:
${jdText || `Role: ${role} — no JD provided`}

CANDIDATE RESUME:
${resumeText || "No resume provided — use generic profile for role"}

Return this exact JSON shape:
{
  "candidateName": "Full name or 'Candidate'",
  "detectedLevel": "fresher|intermediate|experienced",
  "yearsExperience": <number>,
  "levelConfidence": <0-100>,
  "levelReason": "one sentence explaining why this level was assigned",
  "keySkills": ["skill1", "skill2", "skill3"],
  "missingSkills": ["skill from JD not in resume"],
  "technicalStack": ["language/framework/tool"],
  "highlights": ["notable achievement or credential"],
  "redFlags": ["concern if any, else empty array"],
  "jdMatchScore": <0-100>,
  "summaryForAgent": "2-3 sentences briefing the AI interviewer on this candidate"
}`,
        }],
        "You are an expert technical recruiter. Analyse resumes precisely. Return ONLY valid JSON — no prose, no markdown fences.",
        1200
      );

      const analysis = parseJSON(analysisRaw);
      if (!analysis) throw new Error("Failed to parse analysis JSON");

      // --- AI: Generate personalised questions ---
      const levelConfig = {
        fresher: {
          label:  "Fresher (0–2 years)",
          focus:  "fundamentals, theoretical knowledge, basic problem-solving, learning agility, enthusiasm. Avoid deep architecture or leadership questions.",
          depth:  "surface to medium",
        },
        intermediate: {
          label:  "Intermediate (2–5 years)",
          focus:  "hands-on implementation, debugging, moderate system design, past project impact, trade-off decisions.",
          depth:  "medium to deep",
        },
        experienced: {
          label:  "Experienced (5+ years)",
          focus:  "architecture decisions at scale, technical leadership, mentoring, complex trade-offs, cross-team impact, strategy.",
          depth:  "deep",
        },
      };
      const lvl = levelConfig[analysis.detectedLevel] || levelConfig.fresher;

      const questionsRaw = await callClaude(
        [{
          role: "user",
          content: `Generate exactly ${questionCount} adaptive interview questions.

CANDIDATE PROFILE:
- Name: ${analysis.candidateName}
- Level: ${lvl.label}
- Key skills: ${analysis.keySkills.join(", ")}
- Tech stack: ${analysis.technicalStack.join(", ")}
- Missing skills vs JD: ${analysis.missingSkills.join(", ")}
- Highlights: ${analysis.highlights.join(", ")}
- Agent briefing: ${analysis.summaryForAgent}

ROLE: ${role}
FOCUS AREA: ${lvl.focus}
QUESTION DEPTH: ${lvl.depth}

Rules:
- Mix: 40% technical, 30% behavioral/situational, 20% role-specific, 10% growth/motivation
- Probe missing skills gently (don't embarrass)
- Tailor to their actual stack (${analysis.technicalStack.slice(0,3).join(", ")})
- Make questions sound natural and conversational
- Each question should be standalone (candidate hasn't heard previous answers)

Return ONLY a JSON array:
[
  {
    "id": 1,
    "question": "full question text",
    "type": "technical|behavioral|situational|motivational",
    "topic": "2-3 word topic label",
    "depth": "surface|medium|deep",
    "targetSkill": "what skill this probes",
    "followupTriggers": ["keyword1", "keyword2"],
    "scoringCriteria": "what a good answer looks like in 1 sentence"
  }
]`,
        }],
        "You are a senior technical interviewer. Generate insightful, adaptive questions. Return ONLY a JSON array.",
        2000
      );

      const questions = parseJSON(questionsRaw);
      if (!Array.isArray(questions)) throw new Error("Failed to parse questions JSON");

      // --- Create session in SQLite DB ---
      const sessionId = uuid();

      let finalResumeUrl = null;
      let finalJdUrl = null;

      // Move files to persistent storage
      if (resumePath && fs.existsSync(resumePath)) {
        finalResumeUrl = path.join("uploads", "documents", `${sessionId}_resume${path.extname(resumePath)}`);
        fs.renameSync(resumePath, finalResumeUrl);
      }
      if (jdPath && fs.existsSync(jdPath)) {
        finalJdUrl = path.join("uploads", "documents", `${sessionId}_jd${path.extname(jdPath)}`);
        fs.renameSync(jdPath, finalJdUrl);
      }
      
      db.prepare(`
        INSERT INTO sessions (
          id, candidate_name, candidate_email, role, detected_level, level_reason, 
          recruiter_email, status, key_skills, missing_skills, 
          technical_stack, jd_match_score, analysis_summary, resume_blob_url, jd_blob_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId, 
        analysis.candidateName || 'Candidate', 
        analysis.candidateEmail || null,
        role, 
        analysis.detectedLevel || 'fresher', 
        analysis.levelReason || '',
        recruiterEmail, 
        "waiting", 
        JSON.stringify(analysis.keySkills || []), 
        JSON.stringify(analysis.missingSkills || []),
        JSON.stringify(analysis.technicalStack || []), 
        analysis.jdMatchScore || 0, 
        analysis.summaryForAgent || '',
        finalResumeUrl,
        finalJdUrl
      );

      const insertQ = db.prepare(`
        INSERT INTO questions (id, session_id, question_number, question_text, question_type, topic, depth, target_skill, followup_triggers, scoring_criteria)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const dbQuestions = [];
      questions.forEach((q, i) => {
        const qId = uuid();
        insertQ.run(
          qId, 
          sessionId, 
          i + 1, 
          q.question || q.questionText, 
          q.type, 
          q.topic, 
          q.depth, 
          q.targetSkill || q.topic, 
          JSON.stringify(q.followupTriggers || []), 
          JSON.stringify(q.scoringCriteria || {})
        );
        dbQuestions.push({ id: qId, topic: q.topic, type: q.type, depth: q.depth });
      });

      // Files have been moved, so no need to cleanup on success

      const baseUrl = process.env.BASE_URL || `http://${req.get("host")}`;
      setImmediate(async () => {
        try {
          if (recruiterEmail) {
            await emailService.sendHRScheduledNotification({
              recruiterEmail,
              candidateName: analysis.candidateName || 'Candidate',
              role,
              level: analysis.detectedLevel || 'fresher',
              scheduledAt: null,
              sessionId,
              baseUrl
            });
          }
          if (analysis.candidateEmail) {
            await emailService.sendCandidateInvite({
              candidateEmail: analysis.candidateEmail,
              candidateName: analysis.candidateName || 'Candidate',
              role,
              interviewLink: `${baseUrl}/candidate.html?session=${sessionId}`,
              scheduledAt: null
            });
          }
        } catch (err) {
          console.error("Failed to send scheduled emails", err);
        }
      });

      res.json({
        success:   true,
        sessionId,
        analysis,
        questions: dbQuestions,
        totalQuestions: dbQuestions.length,
      });

    } catch (err) {
      cleanupFile(resumePath);
      cleanupFile(jdPath);
      console.error("[/api/analyse]", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

app.use("/api/hr", hrRoutes);
app.use("/api/interview", interviewRoutes);

// ═══════════════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n  ✦ InterviewAI Agent running at http://localhost:${PORT}`);
  console.log(`  ✦ Upload folder : ./uploads`);
  console.log(`  ✦ Reports folder: ./reports\n`);
});