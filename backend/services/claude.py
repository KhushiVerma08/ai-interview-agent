import os
import json
import logging
import asyncio
import google.generativeai as genai
from anthropic import AsyncAnthropic
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

logger = logging.getLogger(__name__)

api_keys = [k.strip() for k in os.getenv("GEMINI_API_KEY", "").split(",") if k.strip()]
current_key_idx = 0

if not api_keys:
    logger.warning("No GEMINI_API_KEY found.")
else:
    genai.configure(api_key=api_keys[0])

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
anthropic_client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

# Map our internal model names to Claude models if using Anthropic
ANTHROPIC_MODELS = {
    "gemini-2.5-flash": "claude-3-5-sonnet-20240620",
    "gemini-2.5-pro": "claude-3-5-sonnet-20240620"
}

SMART_MODEL = "gemini-2.5-flash"
FAST_MODEL = "gemini-2.5-flash"

import re

def parse_json(text: str) -> dict:
    try:
        text = text.replace("```json", "").replace("```", "").strip()
        match = re.search(r'(\{.*\}|\[.*\])', text, re.DOTALL)
        if match:
            text = match.group(1)
        return json.loads(text)
    except Exception as e:
        logger.warning(f"JSON parse failed: {str(e)[:200]}")
        return None

async def call(model_name: str, system: str, user_content: str, max_tokens: int = 1500) -> str:
    global current_key_idx
    
    # Try Anthropic first if available
    if anthropic_client:
        try:
            anthropic_model = ANTHROPIC_MODELS.get(model_name, "claude-3-5-sonnet-20240620")
            response = await anthropic_client.messages.create(
                model=anthropic_model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user_content}]
            )
            return response.content[0].text
        except Exception as e:
            logger.warning(f"Anthropic API failed ({str(e)}). Falling back to Gemini...")
            # Fall through to Gemini execution block
            
    if not api_keys:
        raise Exception("No API keys (Anthropic or Gemini) configured.")
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            model = genai.GenerativeModel(model_name, system_instruction=system)
            response = await model.generate_content_async(user_content)
            return response.text
        except Exception as e:
            err_msg = str(e).lower()
            if "429" in err_msg or "quota" in err_msg or "resourceexhausted" in err_msg:
                if len(api_keys) > 1:
                    current_key_idx = (current_key_idx + 1) % len(api_keys)
                    genai.configure(api_key=api_keys[current_key_idx])
                    logger.warning(f"Rate limited by Gemini. Switching to API key index {current_key_idx} (Retry {attempt + 1}/{max_retries})...")
                    continue
                elif attempt < max_retries - 1:
                    wait_time = 45 * (attempt + 1)
                    logger.warning(f"Rate limited by Gemini. Waiting {wait_time}s before retry {attempt + 1}/{max_retries}...")
                    await asyncio.sleep(wait_time)
                    continue
            
            logger.error(f"Gemini API error: {e}")
            raise e

    raise Exception("All API keys and retries exhausted due to rate limits. Please check your Gemini API quotas.")

async def analyze_documents(jd_text: str, resume_text: str, role: str) -> dict:
    raw = await call(
        SMART_MODEL,
        "You are a senior technical recruiter with 15+ years experience. Analyse resumes and JDs with precision. ALWAYS return ONLY valid JSON — no prose, no markdown fences, no explanation.",
        f"""Analyse this resume against the job description and return a structured analysis.

JOB DESCRIPTION:
{jd_text or f"Role: {role} — no JD provided"}

CANDIDATE RESUME:
{resume_text or "No resume provided"}

Rules:
- Detect experience level from: years of experience mentioned, job titles held, complexity of projects, seniority of responsibilities
- fresher = less than 1 year of experience, experienced = 1+ years of experience
- Scan for candidate email address if present in resume text

Return EXACTLY this JSON structure (no deviations):
{{
  "candidateName": "extracted full name or 'Candidate'",
  "candidateEmail": "extracted email or null",
  "jobRole": "extract the specific job title or role from the JD",
  "detectedLevel": "fresher|experienced",
  "levelReason": "one short line explaining the experience level (e.g. 3 years of react experience)",
  "yearsExperience": 0,
  
  "jdInfo": {{
    "techStack": ["..."],
    "responsibilities": ["..."],
    "seniority": "...",
    "mustHaveSkills": ["..."]
  }},
  
  "resumeInfo": {{
    "skills": ["ONLY candidate skills that explicitly match the JD requirements/tech stack"],
    "experienceSummary": "...",
    "projects": ["..."],
    "technologies": ["..."]
  }},
  
  "gapAnalysis": {{
    "missingSkills": ["skills explicitly listed in the JD that are completely missing from the resume"],
    "experienceGaps": ["shortfalls in required years of experience or domain expertise"],
    "educationalGaps": ["missing degrees, certifications, or educational qualifications required by the JD"],
    "matchScore": 85,
    "summary": "2 sentence summary of where candidate meets and misses the JD"
  }},
  
  "summaryForAgent": "3 sentence brief for the AI interviewer — background, strengths, what to probe"
}}""",
        1200
    )
    res = parse_json(raw)
    if not res: raise Exception("Failed to parse document analysis")
    return res

async def generate_question_plan(analysis: dict, role: str, question_count: int = 12) -> list:
    level_config = {
        "fresher": {
            "label": "Fresher (0–2 years)",
            "focus": "- Core fundamentals\\n- Basic problem solving\\n- Enthusiasm",
            "distribution": "50% technical, 25% behavioral"
        },
        "intermediate": {
            "label": "Intermediate (2–5 years)",
            "focus": "- Hands-on implementation\\n- Debugging\\n- Trade-offs",
            "distribution": "40% technical, 25% behavioral"
        },
        "experienced": {
            "label": "Experienced (5+ years)",
            "focus": "- Architecture\\n- Technical leadership\\n- Scale",
            "distribution": "30% system design, 25% technical"
        }
    }
    lvl = analysis.get("detectedLevel", "fresher")
    cfg = level_config.get(lvl, level_config["fresher"])

    raw = await call(
        SMART_MODEL,
        "You are a world-class technical interviewer. Generate precise, insightful interview questions. ALWAYS return ONLY a valid JSON array — no prose, no markdown.",
        f"""Generate a structured interview question plan.
ROLE: {role}
CANDIDATE LEVEL: {cfg['label']}
KEY SKILLS FROM RESUME: {", ".join(analysis.get("resumeInfo", {}).get("skills", []))}
TECH STACK: {", ".join(analysis.get("resumeInfo", {}).get("technologies", []))}
MISSING SKILLS (JD GAP): {", ".join(analysis.get("gapAnalysis", {}).get("missingSkills", []))}
WEAK AREAS (JD GAP): {", ".join(analysis.get("gapAnalysis", {}).get("weakAreas", []))}
AGENT BRIEFING: {analysis.get("summaryForAgent", "")}

QUESTION FLOW (must strictly follow this exact order):

If Candidate is {level_config['fresher']['label']}:
1. Core Technical Skills (Evaluate fundamental skills and core technologies)
2. Basic Problem-Solving (Professional/educational problem solving scenarios)
3. Educational Projects (Discuss educational competencies and projects)
4. Theoretical Knowledge (Test theoretical basics)
5. Motivation (Why this company and role?)
6. Career Goals (Future aspirations and growth)

If Candidate is {level_config['experienced']['label']}:
1. Handling Complex Challenges (Real-world technical challenges)
2. Team Leadership Scenarios (Mentorship, conflict resolution, leadership)
3. High-Level Strategy (Drive results, system architecture, strategy)
4. Motivation (Why this company and role?)
5. Career Goals (Future aspirations and growth)

Generate exactly {max(1, question_count - 2)} questions spanning the modules above.

CRITICAL RULE on Difficulty Progression:
Ensure the generated technical questions progressively increase in difficulty and depth. 
- Early questions (e.g., Module 1) MUST be "surface" depth.
- Middle questions (e.g., Module 2) MUST be "medium" depth.
- Late technical questions (e.g., Module 3/4) MUST be "deep" depth.
Return ONLY a JSON array:
[
  {{
    "id": 1,
    "questionText": "full conversational question",
    "type": "technical|behavioral|situational|motivational",
    "topic": "2-3 word topic",
    "depth": "surface|medium|deep",
    "flow": "core_technical|practical|gap_probe|behavioral|closing",
    "targetSkill": "specific skill this tests",
    "followupTriggers": ["keyword1"],
    "scoringCriteria": {{
      "excellent": "...",
      "good": "...",
      "poor": "..."
    }}
  }}
]""",
        3000
    )
    res = parse_json(raw)
    if not res: raise Exception("Failed to parse questions")
    
    # Prepend standard unified starting stage
    intro_questions = [
        {
            "id": "intro_1",
            "questionText": f"Hello {analysis.get('candidateName', 'there')}, I am the AI Interview Agent. Before we dive in, do I have your consent to proceed and record this session? If so, please share your background and your interest in this experience.",
            "type": "consent_intro",
            "topic": "Introduction",
            "depth": "surface",
            "flow": "opening",
            "targetSkill": "communication",
            "followupTriggers": ["background"],
            "scoringCriteria": {
                "excellent": "Provides consent and gives a clear, concise background summary.",
                "good": "Provides consent and a reasonable background.",
                "poor": "Refuses consent or gives an unclear background."
            }
        },
        {
            "id": "intro_2",
            "questionText": "Thank you. Could you discuss your proudest achievement or a significant momentary success from your recent experience?",
            "type": "behavioral",
            "topic": "Proudest Achievement",
            "depth": "surface",
            "flow": "opening",
            "targetSkill": "communication",
            "followupTriggers": ["achievement", "success"],
            "scoringCriteria": {
                "excellent": "Clearly articulates a significant achievement with metrics or clear impact.",
                "good": "Describes a relevant achievement.",
                "poor": "Vague or lacks a specific achievement."
            }
        }
    ]
    
    return intro_questions + res

async def evaluate_answer(question: dict, answer: str, level: str, previous_answers: list = None, upcoming_questions: list = None) -> dict:
    if previous_answers is None: previous_answers = []
    if upcoming_questions is None: upcoming_questions = []

    context = ""
    if previous_answers:
        context = "\\nPrevious answers for context:\\n" + "\\n".join([f"Q: {a['questionText']} | A: {a['answerText']}" for a in previous_answers[-3:]])
    
    upcoming_context = ""
    if upcoming_questions:
        upcoming_context = "\\nUPCOMING PLANNED QUESTIONS:\\n" + "\\n".join([f"ID: {q['id']} | Q: {q['questionText']} | SKILL: {q['targetSkill']}" for q in upcoming_questions])

    raw = await call(
        FAST_MODEL,
        "You are an expert technical interviewer. Evaluate interview answers precisely and fairly. ALWAYS return ONLY valid JSON.",
        f"""Evaluate this interview answer across 6 core parameters.
CANDIDATE LEVEL: {level}
QUESTION: "{question.get('questionText')}"
SCORING CRITERIA: {json.dumps(question.get('scoringCriteria'))}
{context}
{upcoming_context}

CANDIDATE'S ANSWER: "{answer}"

If the candidate's answer naturally covered the topics or skills of any UPCOMING PLANNED QUESTIONS, include their IDs in the "coveredUpcomingQuestionIds" array so we can skip them.

Return ONLY this JSON:
{{
  "technicalScore": 5.0,
  "depthScore": 5.0,
  "clarityScore": 5.0,
  "problemSolvingScore": 5.0,
  "confidenceScore": 5.0,
  "communicationScore": 5.0,
  "coveredUpcomingQuestionIds": [],
  "keywordsDetected": [],
  "needsFollowup": false,
  "followupQuestion": "",
  "followupReason": "",
  "internalNote": "",
  "acknowledgment": ""
}}""",
        800
    )
    res = parse_json(raw)
    if not res:
        return {
            "technicalScore": 5, "depthScore": 5, "clarityScore": 5, "problemSolvingScore": 5,
            "confidenceScore": 5, "communicationScore": 5, "coveredUpcomingQuestionIds": [],
            "overallScore": 5, "keywordsDetected": [], "needsFollowup": False,
            "followupQuestion": "", "followupReason": "", "internalNote": "Evaluation failed",
            "acknowledgment": "Thank you for that answer.",
        }
    
    # Strictly enforce the final_score formula in Python
    tech = float(res.get("technicalScore", 5))
    depth = float(res.get("depthScore", 5))
    clarity = float(res.get("clarityScore", 5))
    ps = float(res.get("problemSolvingScore", 5))
    conf = float(res.get("confidenceScore", 5))
    comm = float(res.get("communicationScore", 5))
    
    res["overallScore"] = round((tech*0.30 + depth*0.20 + clarity*0.15 + ps*0.15 + conf*0.10 + comm*0.10), 2)
    return res

async def generate_final_report(session: dict, questions: list, answers: list, scores: list) -> dict:
    cnt = max(len(scores), 1)
    tech_avg = round(sum([s.get("technical_score", 0) for s in scores]) / cnt, 2)
    depth_avg = round(sum([s.get("depth_score", 0) for s in scores]) / cnt, 2)
    clar_avg = round(sum([s.get("clarity_score", 0) for s in scores]) / cnt, 2)
    ps_avg = round(sum([s.get("problem_solving_score", 0) for s in scores]) / cnt, 2)
    conf_avg = round(sum([s.get("confidence_score", 0) for s in scores]) / cnt, 2)
    comm_avg = round(sum([s.get("communication_score", 0) for s in scores]) / cnt, 2)
    
    # Strictly enforce formula for final score
    overall = round((tech_avg*0.30 + depth_avg*0.20 + clar_avg*0.15 + ps_avg*0.15 + conf_avg*0.10 + comm_avg*0.10), 2)
    competency = round((conf_avg + comm_avg + ps_avg + depth_avg) / 4, 2)
    
    if overall >= 8:
        recommendation = "Strongly Recommended"
    elif overall >= 6:
        recommendation = "Recommended"
    elif overall >= 4:
        recommendation = "Needs Improvement"
    else:
        recommendation = "Not Recommended"
    
    raw = await call(
        SMART_MODEL,
        "You are a senior hiring manager writing a precise, unbiased, evidence-based evaluation. ALWAYS return ONLY valid JSON.",
        f"""Generate a comprehensive hiring evaluation report.
CANDIDATE: {session.get('candidate_name')}
COMPOSITE SCORES: OVERALL {overall}/10, COMPETENCY {competency}/10
CALCULATED RECOMMENDATION: {recommendation}

Return ONLY this JSON:
{{
  "verdictConfidence": 90,
  "executiveSummary": "...",
  "strengths": ["..."],
  "criticalGaps": ["..."],
  "stage2FocusAreas": ["..."],
  "hiringJustification": "...",
  "rejectionRationale": null,
  "improvementSuggestions": null,
  "salaryBandSuggestion": "...",
  "urgency": "standard"
}}""",
        1500
    )
    res = parse_json(raw)
    if not res: raise Exception("Failed to parse final report")
    
    return {
        "overallScore": overall,
        "technicalAvg": tech_avg,
        "depthAvg": depth_avg,
        "clarityAvg": clar_avg,
        "problemSolvingAvg": ps_avg,
        "confidenceAvg": conf_avg,
        "communicationAvg": comm_avg,
        "competencyScore": competency,
        "verdict": recommendation,
        "verdictConfidence": res.get("verdictConfidence"),
        "executiveSummary": res.get("executiveSummary"),
        "strengths": res.get("strengths", []),
        "criticalGaps": res.get("criticalGaps", []),
        "stage2FocusAreas": res.get("stage2FocusAreas", []),
        "hiringJustification": res.get("hiringJustification"),
        "rejectionRationale": res.get("rejectionRationale"),
        "improvementSuggestions": res.get("improvementSuggestions"),
        "salaryBandSuggestion": res.get("salaryBandSuggestion"),
        "urgency": res.get("urgency"),
        "failedQuestions": []
    }

async def generate_opening(candidate_name: str, role: str, level: str, first_question: str) -> str:
    return await call(
        FAST_MODEL,
        "You are a professional but warm AI interviewer. Be concise. Return only the spoken text.",
        f"Generate a natural opening. Candidate: {candidate_name}, Role: {role}, Level: {level}. Get consent to proceed without asking the question.",
        300
    )

async def generate_consent_bridge(candidate_name: str, first_question: str) -> str:
    return await call(FAST_MODEL, "Return only the spoken text.", f"Acknowledge consent and transition to: {first_question}", 150)

async def generate_edge_case_response(situation: str, question: str) -> str:
    return await call(FAST_MODEL, "Return only spoken text.", f"Handle {situation} for question: {question}", 150)

async def generate_dynamic_followup(jd_text: str, question_text: str, weak_answer: str, missing_skills: list, key_skills: list) -> str:
    """Generate a dynamic follow-up question based on a weak answer, steering towards JD gaps."""
    return await call(
        FAST_MODEL,
        "You are an expert technical interviewer. Keep it conversational, brief, and spoken. Return ONLY the spoken question text.",
        f"""The candidate gave a weak answer to this question: "{question_text}"
Candidate's Answer: "{weak_answer}"

JOB DESCRIPTION CONTEXT:
{jd_text}
Key Skills to verify: {key_skills}
Missing Skills to probe: {missing_skills}

Generate a short, probing follow-up question (1-2 sentences max) that asks them to elaborate, specifically steering them to demonstrate if they have any of the missing/key skills relevant to their weak answer.""",
        200
    )
