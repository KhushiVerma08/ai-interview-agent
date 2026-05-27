// src/services/claudeService.js
// All Claude API calls — the brain of the interview agent

const Anthropic = require("@anthropic-ai/sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger    = require("../config/logger");

let anthropicClient = null;
if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
  anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

let geminiClient = null;
if (process.env.GEMINI_API_KEY) {
  geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// Use Opus for deep reasoning (parse, generate, report) | Haiku for fast in-call scoring
// When falling back to Gemini, we map both to gemini-2.5-flash since it handles both well.
const SMART_MODEL = "claude-opus-4-5";
const FAST_MODEL  = "claude-haiku-4-5-20251001";

function parseJSON(text) {
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    logger.warn("JSON parse failed", { text: text.substring(0, 200) });
    return null;
  }
}

async function call(model, system, userContent, maxTokens = 1500, retries = 3) {
  try {
    if (anthropicClient) {
      const res = await anthropicClient.messages.create({
        model: model === SMART_MODEL ? "claude-3-5-sonnet-20241022" : model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userContent }],
      });
      return res.content[0].text;
    } else if (geminiClient) {
      const geminiModel = geminiClient.getGenerativeModel({ model: "gemini-flash-latest", systemInstruction: system });
      const result = await geminiModel.generateContent(userContent);
      return result.response.text();
    } else {
      throw new Error("No AI API configured. Please provide ANTHROPIC_API_KEY or GEMINI_API_KEY in .env");
    }
  } catch (error) {
    if (error.message && error.message.includes('429') && retries > 0) {
      logger.warn(`Gemini API rate limit hit (429). Retrying in 10 seconds... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      return call(model, system, userContent, maxTokens, retries - 1);
    }
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  1. ANALYSE JD + RESUME
// ═══════════════════════════════════════════════════════════════════════
async function analyzeDocuments(jdText, resumeText, role) {
  logger.info("Claude: Analysing JD + Resume", { role });

  const raw = await call(
    SMART_MODEL,
    `You are a senior technical recruiter with 15+ years experience. 
     Analyse resumes and JDs with precision. 
     ALWAYS return ONLY valid JSON — no prose, no markdown fences, no explanation.`,
    `Analyse this resume against the job description and return a structured analysis.

JOB DESCRIPTION:
${jdText || `Role: ${role} — no JD provided`}

CANDIDATE RESUME:
${resumeText || `No resume provided`}

Rules:
- Detect experience level from: years of experience mentioned, job titles held, complexity of projects, seniority of responsibilities
- fresher = 0-2 years, intermediate = 2-5 years, experienced = 5+ years
- Scan for candidate email address if present in resume text

Return EXACTLY this JSON structure (no deviations):
{
  "candidateName": "extracted full name or 'Candidate'",
  "candidateEmail": "extracted email or null",
  "detectedLevel": "fresher|intermediate|experienced",
  "yearsExperience": <number>,
  "levelConfidence": <0-100>,
  "levelReason": "one precise sentence explaining the classification with evidence",
  "keySkills": ["skill1", "skill2", ...],
  "missingSkills": ["skills in JD not in resume"],
  "technicalStack": ["technologies, languages, frameworks found in resume"],
  "education": "highest qualification detected",
  "highlights": ["notable achievement or credential from resume"],
  "redFlags": ["any concern e.g. gap years, overqualified, job-hopping — empty array if none"],
  "jdMatchScore": <0-100>,
  "gapAnalysis": "2 sentence summary of where candidate meets and misses the JD",
  "summaryForAgent": "3 sentence brief for the AI interviewer — background, strengths, what to probe"
}`,
    1200
  );

  const result = parseJSON(raw);
  if (!result) throw new Error("Failed to parse document analysis from Claude");
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
//  2. GENERATE PERSONALISED QUESTION PLAN
// ═══════════════════════════════════════════════════════════════════════
async function generateQuestionPlan(analysis, role, questionCount = 12) {
  logger.info("Claude: Generating question plan", { level: analysis.detectedLevel, count: questionCount });

  const levelConfig = {
    fresher: {
      label: "Fresher (0–2 years)",
      focus: `
        - Core fundamentals and theoretical knowledge (don't assume production experience)
        - Basic problem solving and logical thinking
        - Understanding of data structures, algorithms at an introductory level
        - Enthusiasm, learning agility, and growth mindset
        - Projects from college, internships, personal work — treat these seriously
        - NO deep system design, NO architectural leadership, NO complex distributed systems`,
      distribution: "50% technical fundamentals, 25% behavioral/learning agility, 15% situational, 10% motivation",
    },
    intermediate: {
      label: "Intermediate (2–5 years)",
      focus: `
        - Hands-on implementation experience — ask for real code/system examples
        - Debugging and troubleshooting real production issues
        - Trade-off decisions: when to use X vs Y
        - Basic to moderate system design — APIs, caching, databases
        - Team collaboration, code review, agile experience
        - Ownership of features end-to-end`,
      distribution: "40% technical depth, 25% behavioral/situational, 20% system design, 15% leadership/collaboration",
    },
    experienced: {
      label: "Experienced (5+ years)",
      focus: `
        - Architecture decisions at scale — what breaks, what holds
        - Technical leadership: mentoring, code standards, technical direction
        - Complex system design: distributed systems, consistency, availability
        - Cross-team and stakeholder communication
        - Handling production incidents and postmortems
        - Strategic thinking: build vs buy, technical debt, long-term roadmap`,
      distribution: "30% system design, 25% leadership/mentoring, 25% technical depth, 20% behavioral/situational",
    },
  };

  const cfg = levelConfig[analysis.detectedLevel] || levelConfig.fresher;

  const raw = await call(
    SMART_MODEL,
    `You are a world-class technical interviewer. Generate precise, insightful interview questions.
     ALWAYS return ONLY a valid JSON array — no prose, no markdown, no explanation.`,
    `Generate a structured interview question plan.

ROLE: ${role}
CANDIDATE LEVEL: ${cfg.label}
KEY SKILLS FROM RESUME: ${(analysis.keySkills || []).join(", ")}
TECH STACK: ${(analysis.technicalStack || []).join(", ")}
MISSING SKILLS vs JD: ${(analysis.missingSkills || []).join(", ")}
AGENT BRIEFING: ${analysis.summaryForAgent}
JD MATCH SCORE: ${analysis.jdMatchScore}%

QUESTION FOCUS:
${cfg.focus}

DISTRIBUTION: ${cfg.distribution}

QUESTION FLOW (must follow this order):
1. Opening / Introduction (1-2 questions) — warm up, tell me about yourself, recent work
2. Core Technical (4-5 questions) — directly from their tech stack
3. Practical / Scenario-based (2-3 questions) — how would you handle X
4. Gap Area Probing (1-2 questions) — skills in JD missing from resume (probe gently)
5. Behavioral / Soft Skills (1-2 questions) — STAR format situations
6. Closing / Motivation (1 question) — why this role, career direction

RULES:
- Generate exactly ${questionCount} questions
- Every question must be conversational — not a quiz, a dialogue
- For gap areas: ask in a way that gives benefit of the doubt ("Have you had a chance to work with X?")
- Questions must reference the candidate's ACTUAL tech stack — not generic
- Each question must have 2-3 keyword triggers for follow-up detection
- Scoring criteria must be specific — what does a 7/10 answer look like vs 3/10

Return ONLY a JSON array:
[
  {
    "id": 1,
    "questionText": "full conversational question",
    "type": "technical|behavioral|situational|motivational",
    "topic": "2-3 word topic",
    "depth": "surface|medium|deep",
    "flow": "opening|core_technical|practical|gap_probe|behavioral|closing",
    "targetSkill": "specific skill this tests",
    "followupTriggers": ["keyword1", "keyword2", "keyword3"],
    "scoringCriteria": {
      "excellent": "what a 8-10 answer includes",
      "good": "what a 6-7 answer includes",
      "poor": "what a 1-4 answer looks like"
    }
  }
]`,
    3000
  );

  const questions = parseJSON(raw);
  if (!Array.isArray(questions)) throw new Error("Failed to parse question plan from Claude");
  return questions;
}

// ═══════════════════════════════════════════════════════════════════════
//  3. REAL-TIME ANSWER EVALUATION (fast — Haiku model)
// ═══════════════════════════════════════════════════════════════════════
async function evaluateAnswer(question, answer, level, previousAnswers = []) {
  logger.info("Claude: Evaluating answer", { questionId: question.id, level });

  const context = previousAnswers.length > 0
    ? `\nPrevious answers for context:\n${previousAnswers.slice(-3).map(a => `Q: ${a.questionText} | A: ${a.answerText}`).join("\n")}`
    : "";

  const raw = await call(
    FAST_MODEL,
    `You are an expert technical interviewer. Evaluate interview answers precisely and fairly.
     ALWAYS return ONLY valid JSON — no prose, no markdown.`,
    `Evaluate this interview answer.

CANDIDATE LEVEL: ${level}
QUESTION: "${question.questionText}"
QUESTION TYPE: ${question.type}
TARGET SKILL: ${question.targetSkill}
SCORING CRITERIA: ${JSON.stringify(question.scoringCriteria)}
FOLLOW-UP TRIGGERS TO WATCH: ${(question.followupTriggers || []).join(", ")}
${context}

CANDIDATE'S ANSWER: "${answer}"

SCORING RUBRIC (weighted):
- technicalScore (40%): accuracy, correctness, depth of technical knowledge
- depthScore (30%): how well they explained reasoning, not just facts
- clarityScore (20%): communication quality, structure, examples used
- problemSolvingScore (10%): structured thinking, edge cases, trade-offs considered

CRITICAL REQUIREMENT FOR FOLLOW-UPS:
If the answer is vague, surface-level, or mentions a specific technology/keyword, you MUST extract that keyword and ask a direct follow-up challenging them on it. For example: "You mentioned using Redis for caching. How would you ensure Redis data persistence?" Probe if their keyword is smart and relevant to the actual job.

Return ONLY this JSON:
{
  "technicalScore": <1-10>,
  "depthScore": <1-10>,
  "clarityScore": <1-10>,
  "problemSolvingScore": <1-10>,
  "overallScore": <weighted average>,
  "keywordsDetected": ["keyword found that is worth probing"],
  "needsFollowup": <true|false>,
  "followupQuestion": "specific targeted follow-up question referencing a keyword they actually said",
  "followupReason": "which keyword/claim triggered this follow-up and why it matters",
  "internalNote": "one sentence recruiter note — what this answer reveals about the candidate",
  "acknowledgment": "1-2 sentence natural interviewer response before next question (do not repeat the question or be sycophantic)"
}`,
    600
  );

  const result = parseJSON(raw);
  if (!result) {
    return {
      technicalScore: 5, depthScore: 5, clarityScore: 5, problemSolvingScore: 5,
      overallScore: 5, keywordsDetected: [], needsFollowup: false,
      followupQuestion: "", followupReason: "", internalNote: "Evaluation failed",
      acknowledgment: "Thank you for that answer.",
    };
  }

  // Recalculate weighted overall
  result.overallScore = Math.round(
    (result.technicalScore * 0.4 + result.depthScore * 0.3 +
     result.clarityScore * 0.2 + result.problemSolvingScore * 0.1) * 10
  ) / 10;

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
//  4. GENERATE FINAL EVALUATION REPORT
// ═══════════════════════════════════════════════════════════════════════
async function generateFinalReport(session, questions, answers, scores) {
  logger.info("Claude: Generating final report", { sessionId: session.id });

  const avg = key => {
    const vals = scores.filter(s => s[key] != null).map(s => s[key]);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : 0;
  };

  const techAvg  = avg("technical_score");
  const depthAvg = avg("depth_score");
  const clarAvg  = avg("clarity_score");
  const psAvg    = avg("problem_solving_score");
  const overall  = Math.round((techAvg * 0.4 + depthAvg * 0.3 + clarAvg * 0.2 + psAvg * 0.1) * 10) / 10;

  const passThreshold = parseFloat(process.env.SCORING_THRESHOLD_PASS || "6.0");

  // Identify failed questions for rejection evidence trail
  const failedQs = answers
    .filter(a => !a.is_followup && a.overall_score < 5)
    .map(a => ({
      questionText:  a.question_text,
      answerText:    a.answer_text,
      overallScore:  a.overall_score,
      technicalScore: a.technical_score,
      note:          a.evaluation_note,
    }));

  const answerSummary = answers
    .filter(a => !a.is_followup)
    .map((a, i) => `Q${i + 1} [${a.overall_score}/10]: "${a.question_text}" → "${(a.answer_text || "").substring(0, 150)}" | Note: ${a.evaluation_note}`)
    .join("\n");

  const raw = await call(
    SMART_MODEL,
    `You are a senior hiring manager writing a precise, unbiased, evidence-based evaluation.
     ALWAYS return ONLY valid JSON — no prose, no markdown.`,
    `Generate a comprehensive hiring evaluation report.

CANDIDATE: ${session.candidate_name}
ROLE: ${session.role}
DETECTED LEVEL: ${session.detected_level}
JD MATCH SCORE: ${session.jd_match_score}%
KEY SKILLS: ${session.key_skills}
MISSING SKILLS: ${session.missing_skills}

COMPOSITE SCORES:
- Technical Accuracy (40%): ${techAvg}/10
- Depth of Explanation (30%): ${depthAvg}/10
- Clarity & Communication (20%): ${clarAvg}/10
- Problem-Solving (10%): ${psAvg}/10
- OVERALL: ${overall}/10
- PASS THRESHOLD: ${passThreshold}/10

ANSWER-BY-ANSWER BREAKDOWN:
${answerSummary}

FAILED QUESTIONS (score < 5):
${JSON.stringify(failedQs, null, 2)}

VERDICT RULES:
- STRONGLY_RECOMMENDED: overall ≥ 8.0 AND technical ≥ 7.5
- RECOMMENDED: overall ≥ ${passThreshold} 
- NEEDS_FURTHER_REVIEW: overall 4.5–${passThreshold - 0.1} (borderline — human review needed)
- NOT_RECOMMENDED: overall < 4.5

Return ONLY this JSON:
{
  "verdict": "STRONGLY_RECOMMENDED|RECOMMENDED|NEEDS_FURTHER_REVIEW|NOT_RECOMMENDED",
  "verdictConfidence": <0-100>,
  "executiveSummary": "3-4 sentences, direct, evidence-based — for a busy hiring manager",
  "strengths": ["specific strength with evidence from their answers — at least 3"],
  "criticalGaps": ["specific gap with the exact answer that revealed it — for NOT_RECOMMENDED"],
  "stage2FocusAreas": ["what the next interviewer should probe deeper — 3-5 items"],
  "hiringJustification": "3-4 sentences explaining the verdict with specific answer references — this is the legal-grade rationale",
  "rejectionRationale": "if NOT_RECOMMENDED: detailed paragraph citing which questions failed, why, and what it reveals — null if not rejected",
  "improvementSuggestions": "if NOT_RECOMMENDED or NEEDS_REVIEW: what the candidate should develop — null if strongly recommended",
  "salaryBandSuggestion": "suggested range based on level and performance",
  "urgency": "hire_fast|standard|hold|pass"
}`,
    1500
  );

  const aiReport = parseJSON(raw);
  if (!aiReport) throw new Error("Failed to parse final report from Claude");

  return {
    overallScore:        overall,
    technicalAvg:        techAvg,
    depthAvg,
    clarityAvg:          clarAvg,
    problemSolvingAvg:   psAvg,
    verdict:             aiReport.verdict,
    verdictConfidence:   aiReport.verdictConfidence,
    executiveSummary:    aiReport.executiveSummary,
    strengths:           aiReport.strengths || [],
    criticalGaps:        aiReport.criticalGaps || [],
    stage2FocusAreas:    aiReport.stage2FocusAreas || [],
    hiringJustification: aiReport.hiringJustification,
    rejectionRationale:  aiReport.rejectionRationale,
    improvementSuggestions: aiReport.improvementSuggestions,
    salaryBandSuggestion: aiReport.salaryBandSuggestion,
    urgency:             aiReport.urgency,
    failedQuestions:     failedQs,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  5. GENERATE INTERVIEW OPENING (personalised greeting)
// ═══════════════════════════════════════════════════════════════════════
async function generateOpening(candidateName, role, level, firstQuestion) {
  const raw = await call(
    FAST_MODEL,
    "You are a professional but warm AI interviewer. Be concise. Return only the spoken text.",
    `Generate a natural opening for an AI-conducted interview.

Candidate: ${candidateName}
Role: ${role}
Level: ${level}
First question to transition into: "${firstQuestion}"

Write a warm 3-4 sentence opening:
1. Welcome the candidate by name
2. Introduce yourself as an AI interviewer
3. Briefly explain the format (questions, follow-ups, recording)
4. Ask for their verbal consent to proceed
DO NOT ask the first question — just get consent.
Keep it under 80 words. Sound human, not robotic.`,
    300
  );
  return raw.trim();
}

// ═══════════════════════════════════════════════════════════════════════
//  6. GENERATE CONSENT CONFIRMATION + FIRST QUESTION BRIDGE
// ═══════════════════════════════════════════════════════════════════════
async function generateConsentBridge(candidateName, firstQuestion) {
  const raw = await call(
    FAST_MODEL,
    "You write short interview transitions. Return only the spoken text.",
    `The candidate just gave consent to proceed. Write a 1-2 sentence bridge that:
1. Acknowledges their consent warmly
2. Transitions naturally into: "${firstQuestion}"

Example style: "Wonderful, let's get started. [Question]"
Keep under 40 words.`,
    150
  );
  return raw.trim();
}

// ═══════════════════════════════════════════════════════════════════════
//  7. HANDLE EDGE CASES (silence, "I don't know", confusion)
// ═══════════════════════════════════════════════════════════════════════
async function generateEdgeCaseResponse(situation, question) {
  const prompts = {
    silence: `The candidate has been silent for 30 seconds. Write a gentle 1-sentence prompt to encourage them to answer or say if they need the question repeated. Reference: "${question}"`,
    dont_know: `The candidate said they don't know. Write a 2-sentence response that: 1) normalises not knowing, 2) asks them to reason through it or share a related experience. Keep it encouraging.`,
    confusion: `The candidate seems confused about the question. Write a 2-sentence response that rephrases the question more simply without giving away the answer. Original: "${question}"`,
    too_short: `The candidate gave a very short answer. Write a 1-sentence prompt asking them to elaborate or give a specific example. Keep it natural.`,
  };

  const raw = await call(
    FAST_MODEL,
    "You are a professional AI interviewer handling interview situations gracefully. Return only the spoken text.",
    prompts[situation] || prompts.silence,
    150
  );
  return raw.trim();
}

module.exports = {
  analyzeDocuments,
  generateQuestionPlan,
  evaluateAnswer,
  generateFinalReport,
  generateOpening,
  generateConsentBridge,
  generateEdgeCaseResponse,
};