import os
import shutil
import uuid
import json
import asyncio
from typing import Optional, List, Dict, Any
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks, Body
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import get_db, Session as DbSession, Question as DbQuestion, Answer as DbAnswer, Report as DbReport, AuditLog, InterviewSession, InterviewQuestion
from services.pdf import extract_text
from services.claude import analyze_documents, generate_question_plan, evaluate_answer, generate_final_report, generate_opening, generate_consent_bridge, generate_edge_case_response, generate_dynamic_followup

app = FastAPI(title="AI Interview Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "documents")
SESSION_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "sessions")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(SESSION_DIR, exist_ok=True)

# ─── HR ROUTES ─────────────────────────────────────────────────────────────

@app.post("/api/analyse")
async def analyse(
    resume: Optional[UploadFile] = File(None),
    jd: Optional[UploadFile] = File(None),
    role: str = Form("Software Engineer"),
    questionCount: int = Form(12),
):
    resume_text = ""
    jd_text = ""
    resume_path = None
    jd_path = None

    if resume:
        content = await resume.read()
        resume_path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4()}_{resume.filename}")
        with open(resume_path, "wb") as f:
            f.write(content)
        resume_text = extract_text(resume_path)

    if jd:
        content = await jd.read()
        jd_path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4()}_{jd.filename}")
        with open(jd_path, "wb") as f:
            f.write(content)
        jd_text = extract_text(jd_path)

    if not resume_text and not jd_text:
        raise HTTPException(status_code=400, detail="Upload at least one document.")

    analysis = await analyze_documents(jd_text, resume_text, role)

    return {
        "success": True,
        "analysis": analysis,
        "tempFiles": {
            "resume": os.path.basename(resume_path) if resume_path else None,
            "jd": os.path.basename(jd_path) if jd_path else None
        }
    }

@app.post("/api/schedule")
async def schedule(payload: Dict[Any, Any], db: Session = Depends(get_db)):
    analysis = payload.get("analysis")
    role = payload.get("role", "Software Engineer")
    q_count = payload.get("questionCount", 12)
    temp_files = payload.get("tempFiles", {})

    questions = await generate_question_plan(analysis, role, q_count)
    session_id = str(uuid.uuid4())
    session_folder = os.path.join(SESSION_DIR, session_id)
    os.makedirs(session_folder, exist_ok=True)

    jd_url, resume_url = None, None
    if temp_files.get("jd"):
        src = os.path.join(UPLOAD_DIR, temp_files["jd"])
        if os.path.exists(src):
            shutil.move(src, os.path.join(session_folder, temp_files["jd"]))
            jd_url = f"/uploads/sessions/{session_id}/{temp_files['jd']}"
    if temp_files.get("resume"):
        src = os.path.join(UPLOAD_DIR, temp_files["resume"])
        if os.path.exists(src):
            shutil.move(src, os.path.join(session_folder, temp_files["resume"]))
            resume_url = f"/uploads/sessions/{session_id}/{temp_files['resume']}"

    db_session = DbSession(
        id=session_id,
        candidate_name=analysis.get("candidateName") or "Candidate",
        candidate_email=analysis.get("candidateEmail"),
        role=role,
        detected_level=analysis.get("detectedLevel") or "fresher",
        status="scheduled",
        jd_blob_url=jd_url,
        resume_blob_url=resume_url,
        key_skills=json.dumps(analysis.get("resumeInfo", {}).get("skills", [])),
        missing_skills=json.dumps(analysis.get("gapAnalysis", {}).get("missingSkills", [])),
        jd_match_score=analysis.get("gapAnalysis", {}).get("matchScore"),
        interview_link=f"/candidate?session={session_id}",
        created_at=datetime.utcnow().isoformat()
    )
    db.add(db_session)

    for i, q in enumerate(questions):
        db.add(DbQuestion(
            id=str(uuid.uuid4()),
            session_id=session_id,
            question_number=i+1,
            question_text=q.get("questionText"),
            question_type=q.get("type"),
            topic=q.get("topic"),
            depth=q.get("depth"),
            target_skill=q.get("targetSkill"),
            scoring_criteria=json.dumps(q.get("scoringCriteria", {})),
            followup_triggers=json.dumps(q.get("followupTriggers", [])),
            created_at=datetime.utcnow().isoformat()
        ))
        
        # New: Populate InterviewQuestion (stateless orchestration table)
        from database import InterviewQuestion
        db.add(InterviewQuestion(
            session_id=session_id,
            question_order=i+1,
            question_type=q.get("type"),
            question_text=q.get("questionText")
        ))
    
    # New: Populate InterviewSession
    from database import InterviewSession
    db.add(InterviewSession(
        session_id=session_id,
        candidate_name=analysis.get("candidateName") or "Candidate",
        recall_bot_id="TBD_BOT_ID",
        current_question_index=1, # Starting at 1
        interview_status="Scheduled"
    ))

    db.commit()

    return {"success": True, "sessionId": session_id, "interviewLink": db_session.interview_link}

@app.get("/api/hr/sessions")
def get_sessions(db: Session = Depends(get_db)):
    from database import InterviewSession
    sessions = db.query(DbSession).order_by(DbSession.created_at.desc()).all()
    results = []
    for s in sessions:
        i_session = db.query(InterviewSession).filter(InterviewSession.session_id == s.id).first()
        status = i_session.interview_status if i_session else s.status
        results.append({
            "id": s.id, "candidate_name": s.candidate_name, "role": s.role, 
            "status": status, "detected_level": s.detected_level,
            "created_at": s.created_at, "interview_link": s.interview_link
        })
    return results

@app.get("/api/hr/session/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db)):
    s = db.query(DbSession).filter(DbSession.id == session_id).first()
    if not s: raise HTTPException(status_code=404, detail="Not found")
    qs = db.query(DbQuestion).filter(DbQuestion.session_id == session_id).order_by(DbQuestion.question_number).all()
    ans = db.query(DbAnswer).filter(DbAnswer.session_id == session_id).order_by(DbAnswer.answered_at).all()
    rep = db.query(DbReport).filter(DbReport.session_id == session_id).first()

    return {
        "session": {k: v for k, v in s.__dict__.items() if not k.startswith("_")},
        "questions": [{k: v for k, v in q.__dict__.items() if not k.startswith("_")} for q in qs],
        "answers": [{k: v for k, v in a.__dict__.items() if not k.startswith("_")} for a in ans],
        "report": {k: v for k, v in rep.__dict__.items() if not k.startswith("_")} if rep else None
    }

# ─── INTERVIEW ROUTES ────────────────────────────────────────────────────────

@app.get("/api/interview/session/{session_id}")
def get_interview_session(session_id: str, db: Session = Depends(get_db)):
    s = db.query(DbSession).filter(DbSession.id == session_id).first()
    if not s: raise HTTPException(status_code=404, detail="Not found")
    qs = db.query(DbQuestion).filter(DbQuestion.session_id == session_id).all()
    return {
        "success": True,
        "session": {
            "id": s.id, "candidateName": s.candidate_name, "role": s.role, 
            "status": s.status, "totalQuestions": len(qs)
        },
        "questionTopics": [{"topic": q.topic, "type": q.question_type} for q in qs]
    }

@app.post("/api/interview/start")
async def start_interview(payload: Dict[Any, Any], db: Session = Depends(get_db)):
    s = db.query(DbSession).filter(DbSession.id == payload.get("sessionId")).first()
    if not s: raise HTTPException(status_code=404)
    q = db.query(DbQuestion).filter(DbQuestion.session_id == s.id, DbQuestion.question_number == payload.get("qNum")).first()
    
    if payload.get("qNum") == 1 and s.status != "active":
        s.status = "active"
        s.started_at = datetime.utcnow().isoformat()
        db.commit()
        
    return {"success": True, "question": {"number": q.question_number, "text": q.question_text}}

@app.post("/api/interview/answer")
async def answer_question(payload: Dict[Any, Any], bg_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    sid, q_num, ans_text = payload.get("sessionId"), payload.get("qNum"), payload.get("answerText")
    
    s = db.query(DbSession).filter(DbSession.id == sid).first()
    q = db.query(DbQuestion).filter(DbQuestion.session_id == sid, DbQuestion.question_number == q_num).first()
    
    eval_res = await evaluate_answer(
        {"questionText": payload.get("qText"), "scoringCriteria": json.loads(q.scoring_criteria)},
        ans_text,
        s.detected_level
    )
    
    db_ans = DbAnswer(
        id=str(uuid.uuid4()), session_id=sid, question_id=q.id, question_number=q_num,
        question_text=payload.get("qText"), answer_text=ans_text,
        overall_score=eval_res.get("overallScore"),
        evaluation_note=eval_res.get("internalNote"),
        answered_at=datetime.utcnow().isoformat()
    )
    db.add(db_ans)
    
    total_q = db.query(DbQuestion).filter(DbQuestion.session_id == sid).count()
    is_last = q_num >= total_q
    
    if is_last:
        s.status = "completed"
        # Background task for report generation would go here
        
    db.commit()
    
    return {
        "success": True,
        "evaluation": {"score": eval_res.get("overallScore"), "acknowledgment": eval_res.get("acknowledgment")},
        "action": "complete" if is_last else "next"
    }

@app.post("/api/interview/consent")
async def consent(payload: Dict[Any, Any], db: Session = Depends(get_db)):
    s = db.query(DbSession).filter(DbSession.id == payload.get("sessionId")).first()
    q = db.query(DbQuestion).filter(DbQuestion.session_id == s.id).order_by(DbQuestion.question_number).first()
    bridge = await generate_consent_bridge(s.candidate_name, q.question_text)
    return {"success": True, "bridge": bridge, "question": {"id": q.id, "number": 1, "text": q.question_text}}

async def generate_edge_case_response(situation: str, question: str) -> str:
    # Dummy mock for now
    return "Let's move on."

# ─── RECALL WEBHOOK / ORCHESTRATION LOOP ────────────────────────────────────

@app.post("/api/webhook/recall")
async def recall_webhook(payload: Dict[Any, Any], bg_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Stateless Orchestration Loop triggered by Candidate speaking via Recall bot.
    """
    session_id = payload.get("session_id")
    candidate_answer = payload.get("candidate_text")
    
    # 1. Fetch live interview state
    i_session = db.query(InterviewSession).filter(InterviewSession.session_id == session_id).first()
    if not i_session:
        raise HTTPException(status_code=404, detail="Interview session not found")
        
    curr_idx = i_session.current_question_index
    
    # 2. Fetch the current question row
    i_question = db.query(InterviewQuestion).filter(
        InterviewQuestion.session_id == session_id,
        InterviewQuestion.question_order == curr_idx
    ).first()
    
    if not i_question:
        raise HTTPException(status_code=404, detail="Current question out of bounds")

    # Save candidate answer
    i_question.candidate_answer = candidate_answer
    
    # Fetch full session context for JD details and scoring criteria
    full_session = db.query(DbSession).filter(DbSession.id == session_id).first()
    db_question = db.query(DbQuestion).filter(DbQuestion.session_id == session_id, DbQuestion.question_number == curr_idx).first()

    # 3. Score the answer (T7.2)
    eval_res = await evaluate_answer(
        {"questionText": i_question.question_text, "scoringCriteria": json.loads(db_question.scoring_criteria)},
        candidate_answer,
        full_session.detected_level
    )
    score = eval_res.get("overallScore", 0)
    i_question.score = score
    
    # Threshold Logic
    if score < 3 and i_question.follow_up_count < 2:
        # Ask dynamic follow-up, do NOT increment index
        i_question.follow_up_count += 1
        db.commit()
        
        # Call LLM for dynamic follow up based on JD
        follow_up_text = await generate_dynamic_followup(
            jd_text=full_session.jd_text or "No JD provided",
            question_text=i_question.question_text,
            weak_answer=candidate_answer,
            missing_skills=json.loads(full_session.missing_skills or "[]"),
            key_skills=json.loads(full_session.key_skills or "[]")
        )
        
        return {
            "success": True,
            "action": "play_audio",
            "audio_text": follow_up_text,
            "orchestration_note": "Dynamic follow-up generated"
        }
    else:
        # Good score OR max followups reached. Move to next question.
        i_session.current_question_index += 1
        db.commit()
        
        next_question = db.query(InterviewQuestion).filter(
            InterviewQuestion.session_id == session_id,
            InterviewQuestion.question_order == i_session.current_question_index
        ).first()
        
        if next_question:
            return {
                "success": True,
                "action": "play_audio",
                "audio_text": next_question.question_text,
                "orchestration_note": "Proceeding to next question"
            }
        else:
            i_session.interview_status = "Completed"
            db.commit()
            return {
                "success": True,
                "action": "play_audio",
                "audio_text": "Thank you for your time. That concludes our interview.",
                "orchestration_note": "Interview concluded"
            }
