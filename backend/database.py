import os
from sqlalchemy import create_engine, Column, String, Integer, Float, Text
from sqlalchemy.orm import declarative_base, sessionmaker

DB_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
if not os.path.exists(DB_DIR):
    os.makedirs(DB_DIR, exist_ok=True)

DB_PATH = os.path.join(DB_DIR, "interview_agent.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

# Add check_same_thread=False since FastAPI handles concurrency
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# DB Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ─── Schema Models ─────────────────────────────────────────────────────────────

class HRUser(Base):
    __tablename__ = "hr_users"
    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    created_at = Column(String)

class Session(Base):
    __tablename__ = "sessions"
    id = Column(String, primary_key=True, index=True)
    candidate_name = Column(String)
    candidate_email = Column(String)
    role = Column(String, nullable=False)
    detected_level = Column(String)
    level_confidence = Column(Integer)
    level_reason = Column(String)
    recruiter_email = Column(String)
    status = Column(String, default='created')
    jd_text = Column(String)
    resume_text = Column(String)
    jd_blob_url = Column(String)
    resume_blob_url = Column(String)
    key_skills = Column(String) # JSON array
    missing_skills = Column(String) # JSON array
    technical_stack = Column(String) # JSON array
    jd_match_score = Column(Integer)
    analysis_summary = Column(String)
    teams_meeting_url = Column(String)
    teams_meeting_id = Column(String)
    interview_link = Column(String)
    scheduled_at = Column(String)
    started_at = Column(String)
    ended_at = Column(String)
    duration_seconds = Column(Integer)
    created_at = Column(String)
    updated_at = Column(String)

class Question(Base):
    __tablename__ = "questions"
    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, nullable=False)
    question_number = Column(Integer, nullable=False)
    question_text = Column(String, nullable=False)
    question_type = Column(String)
    topic = Column(String)
    depth = Column(String)
    target_skill = Column(String)
    scoring_criteria = Column(String)
    followup_triggers = Column(String)
    created_at = Column(String)

class Answer(Base):
    __tablename__ = "answers"
    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, nullable=False)
    question_id = Column(String)
    question_number = Column(Integer)
    question_text = Column(String)
    answer_text = Column(String)
    is_followup = Column(Integer, default=0)
    followup_trigger = Column(String)
    technical_score = Column(Float)
    depth_score = Column(Float)
    clarity_score = Column(Float)
    problem_solving_score = Column(Float)
    overall_score = Column(Float)
    evaluation_note = Column(String)
    keywords_detected = Column(String)
    needs_followup = Column(Integer, default=0)
    followup_question = Column(String)
    followup_reason = Column(String)
    answered_at = Column(String)
    audio_url = Column(String)

class Report(Base):
    __tablename__ = "reports"
    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, unique=True, nullable=False)
    overall_score = Column(Float)
    technical_avg = Column(Float)
    depth_avg = Column(Float)
    clarity_avg = Column(Float)
    problem_solving_avg = Column(Float)
    verdict = Column(String)
    verdict_confidence = Column(Integer)
    executive_summary = Column(String)
    ai_justification = Column(String)
    strengths = Column(String)
    gaps = Column(String)
    stage2_focus_areas = Column(String)
    salary_band = Column(String)
    transcript = Column(String)
    failed_questions = Column(String)
    report_pdf_url = Column(String)
    generated_at = Column(String)

class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(String, primary_key=True, index=True)
    session_id = Column(String)
    event = Column(String, nullable=False)
    detail = Column(String)
    created_at = Column(String)

class InterviewSession(Base):
    __tablename__ = "interview_sessions"
    session_id = Column(String, primary_key=True, index=True)
    candidate_name = Column(String)
    recall_bot_id = Column(String)
    current_question_index = Column(Integer, default=0)
    interview_status = Column(String, default="Scheduled")

class InterviewQuestion(Base):
    __tablename__ = "interview_questions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, index=True)
    question_order = Column(Integer)
    question_type = Column(String)
    question_text = Column(String)
    candidate_answer = Column(String, nullable=True)
    score = Column(Integer, nullable=True)
    follow_up_count = Column(Integer, default=0)

# Initialize tables (since this app relies on auto-creating tables)
Base.metadata.create_all(bind=engine)
