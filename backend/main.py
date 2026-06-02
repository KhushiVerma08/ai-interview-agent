import os
import shutil
import uuid
import json
import asyncio
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
def ist_now():
    return datetime.now(IST)

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks, Body
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import get_db, Session as DbSession, Question as DbQuestion, Answer as DbAnswer, Report as DbReport
from services.pdf import extract_text
from services.claude import analyze_documents, generate_question_plan, evaluate_answer, generate_final_report, generate_opening, generate_consent_bridge, generate_edge_case_response, generate_dynamic_followup
from services.email import send_meeting_invite
from services.teams import create_teams_meeting

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
async def schedule_interview(payload: Dict[Any, Any], background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    analysis = payload.get("analysis", {})
    role = payload.get("role", "Software Engineer")
    question_count = payload.get("questionCount", 12)
    temp_files = payload.get("tempFiles")
    confirmed_email = payload.get("confirmedEmail")

    if not confirmed_email and not analysis.get("candidateEmail"):
        raise HTTPException(status_code=400, detail="Candidate email is missing")

    session_id = str(uuid.uuid4())
    questions = await generate_question_plan(analysis, role, question_count)

    jd_url, resume_url = None, None
    jd_text_val, resume_text_val = "", ""
    if temp_files:
        session_folder = os.path.join(SESSION_DIR, session_id)
        os.makedirs(session_folder, exist_ok=True)
        
        src_jd = os.path.join(UPLOAD_DIR, temp_files["jd"]) if temp_files.get("jd") else None
        if src_jd and os.path.exists(src_jd):
            jd_text_val = extract_text(src_jd)
            shutil.move(src_jd, os.path.join(session_folder, temp_files["jd"]))
            jd_url = f"/uploads/sessions/{session_id}/{temp_files['jd']}"
            
        src_resume = os.path.join(UPLOAD_DIR, temp_files["resume"]) if temp_files.get("resume") else None
        if src_resume and os.path.exists(src_resume):
            resume_text_val = extract_text(src_resume)
            shutil.move(src_resume, os.path.join(session_folder, temp_files["resume"]))
            resume_url = f"/uploads/sessions/{session_id}/{temp_files['resume']}"

    scheduled_at = (ist_now() + timedelta(minutes=30)).isoformat()
    # Generate Microsoft Teams Meeting
    subject = f"AI Interview: {analysis.get('candidateName', 'Candidate')} - {role}"
    teams_meeting = create_teams_meeting(subject, scheduled_at)

    db_session = DbSession(
        id=session_id,
        candidate_name=analysis.get("candidateName") or "Candidate",
        candidate_email=confirmed_email or analysis.get("candidateEmail"),
        role=role,
        detected_level=analysis.get("detectedLevel") or "fresher",
        status="scheduled",
        jd_text=jd_text_val,
        resume_text=resume_text_val,
        jd_blob_url=jd_url,
        resume_blob_url=resume_url,
        key_skills=json.dumps(analysis.get("resumeInfo", {}).get("skills", [])),
        missing_skills=json.dumps(analysis.get("gapAnalysis", {}).get("missingSkills", [])),
        jd_match_score=analysis.get("gapAnalysis", {}).get("matchScore"),
        interview_link=f"/candidate?session={session_id}",
        teams_meeting_url=teams_meeting.get("joinUrl"),
        teams_meeting_id=teams_meeting.get("meetingId"),
        scheduled_at=scheduled_at,
        created_at=ist_now().isoformat(),
        current_question_index=1
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
            created_at=ist_now().isoformat()
        ))

    db.commit()

    # Trigger email dispatch in the background
    background_tasks.add_task(
        send_meeting_invite,
        to_email=db_session.candidate_email,
        candidate_name=db_session.candidate_name,
        meeting_link=db_session.interview_link,
        teams_link=db_session.teams_meeting_url,
        scheduled_at=db_session.scheduled_at
    )

    return {"success": True, "sessionId": session_id, "interviewLink": db_session.interview_link}

@app.get("/api/hr/sessions")
def get_sessions(db: Session = Depends(get_db)):
    sessions = db.query(DbSession).order_by(DbSession.created_at.desc()).all()
    results = []
    
    # Auto-cancel logic for stale scheduled sessions
    now = ist_now().replace(tzinfo=None)
    commit_needed = False
    
    for s in sessions:
        display_status = s.status.lower() if s.status else "scheduled"
        if display_status == "active":
            display_status = "in_progress"
        elif display_status == "waiting":
            display_status = "scheduled"

        if display_status == "scheduled":
            # Fallback to created_at if scheduled_at doesn't exist
            timestamp_to_check = s.scheduled_at or s.created_at
            if timestamp_to_check:
                try:
                    time_str = timestamp_to_check.replace("Z", "+00:00")
                    scheduled_time = datetime.fromisoformat(time_str).replace(tzinfo=None)
                    if now - scheduled_time > timedelta(hours=24):
                        s.status = "cancelled"
                        display_status = "cancelled"
                        commit_needed = True
                except ValueError:
                    pass
        elif display_status == "in_progress":
            timestamp_to_check = s.started_at or s.created_at
            if timestamp_to_check:
                try:
                    time_str = timestamp_to_check.replace("Z", "+00:00")
                    started_time = datetime.fromisoformat(time_str).replace(tzinfo=None)
                    if now - started_time > timedelta(hours=2):
                        s.status = "failed"
                        display_status = "failed"
                        commit_needed = True
                except ValueError:
                    pass
                
        results.append({
            "id": s.id, "candidate_name": s.candidate_name, "role": s.role, 
            "status": display_status, "detected_level": s.detected_level,
            "created_at": s.created_at, "interview_link": s.interview_link
        })
        
    if commit_needed:
        db.commit()
        
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
    
    # Fetch the lowest pending question
    q = db.query(DbQuestion).filter(
        DbQuestion.session_id == s.id, 
        DbQuestion.status == 'pending'
    ).order_by(DbQuestion.question_number).first()
    
    if not q:
        return {"success": True, "action": "complete"}
    
    if q.question_number == 1 and s.status != "in_progress":
        s.status = "in_progress"
        s.started_at = ist_now().isoformat()
        db.commit()
        
    return {"success": True, "question": {"number": q.question_number, "text": q.question_text}}

@app.post("/api/interview/answer")
async def answer_question(payload: Dict[Any, Any], bg_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    sid, q_num, ans_text = payload.get("sessionId"), payload.get("qNum"), payload.get("answerText")
    
    s = db.query(DbSession).filter(DbSession.id == sid).first()
    q = db.query(DbQuestion).filter(DbQuestion.session_id == sid, DbQuestion.question_number == q_num).first()
    
    if q and q.status == 'pending':
        q.status = 'asked'
        
    upcoming_qs = db.query(DbQuestion).filter(
        DbQuestion.session_id == sid, 
        DbQuestion.status == 'pending',
        DbQuestion.question_number > q_num
    ).all()
    
    upcoming_dicts = [{"id": u.id, "questionText": u.question_text, "targetSkill": u.target_skill} for u in upcoming_qs]
    
    eval_res = await evaluate_answer(
        {"questionText": payload.get("qText"), "scoringCriteria": json.loads(q.scoring_criteria if q and q.scoring_criteria else "{}")},
        ans_text,
        s.detected_level,
        upcoming_questions=upcoming_dicts
    )
    
    # Mark covered questions as skipped
    covered_ids = eval_res.get("coveredUpcomingQuestionIds", [])
    if covered_ids:
        for uq in upcoming_qs:
            if uq.id in covered_ids:
                uq.status = 'covered_early'
                
    db_ans = DbAnswer(
        id=str(uuid.uuid4()), session_id=sid, question_id=q.id if q else None, question_number=q_num,
        question_text=payload.get("qText"), answer_text=ans_text,
        technical_score=eval_res.get("technicalScore"),
        depth_score=eval_res.get("depthScore"),
        clarity_score=eval_res.get("clarityScore"),
        problem_solving_score=eval_res.get("problemSolvingScore"),
        confidence_score=eval_res.get("confidenceScore"),
        communication_score=eval_res.get("communicationScore"),
        overall_score=eval_res.get("overallScore"),
        evaluation_note=eval_res.get("internalNote"),
        answered_at=ist_now().isoformat()
    )
    db.add(db_ans)
    
    if eval_res.get("needsFollowup") and eval_res.get("followupQuestion"):
        # Count existing followups for this question to increment the decimal properly
        existing_followups = db.query(DbQuestion).filter(
            DbQuestion.session_id == sid, 
            DbQuestion.question_number > q_num, 
            DbQuestion.question_number < q_num + 1
        ).count()
        followup_q_num = q_num + 0.1 + (existing_followups * 0.01)
        
        followup_q = DbQuestion(
            id=str(uuid.uuid4()), session_id=sid, question_number=followup_q_num,
            question_text=eval_res.get("followupQuestion"),
            question_type="followup", topic="Follow-up Probe", target_skill="depth",
            status="pending", scoring_criteria='{"good": "Directly addresses the follow-up probe", "poor": "Fails to provide clarity on the requested detail"}'
        )
        db.add(followup_q)
        
    db.commit()
    
    remaining_pending = db.query(DbQuestion).filter(DbQuestion.session_id == sid, DbQuestion.status == 'pending').count()
    total_answers = db.query(DbAnswer).filter(DbAnswer.session_id == sid).count()
    
    if remaining_pending == 0:
        if total_answers < 7:
            # Generate a dynamic question on the fly to meet the minimum of 7
            new_q_num = db.query(DbQuestion).filter(DbQuestion.session_id == sid).count() + 1
            dynamic_q = DbQuestion(
                id=str(uuid.uuid4()), session_id=sid, question_number=new_q_num,
                question_text=f"Given your previous answers, could you elaborate on a complex technical challenge you faced recently?",
                question_type="behavioral", topic="Dynamic Deep Dive", target_skill="problem_solving",
                status="pending", scoring_criteria='{"good": "Detailed problem solving process", "poor": "Vague response"}'
            )
            db.add(dynamic_q)
            db.commit()
            is_last = False
        else:
            is_last = True
    else:
        is_last = False
    
    if is_last:
        s.status = "completed"
        # bg_tasks.add_task(generate_final_report_task, sid) # Future
        
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
