// src/config/db.js
// SQLite database — swap to PostgreSQL in production by changing the adapter

const Database = require("better-sqlite3");
const path     = require("path");
const fs       = require("fs");

const DB_DIR  = path.join(__dirname, "../../data");
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, "interview_agent.db");

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Performance settings
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── Schema ──────────────────────────────────────────────────────────────────
db.exec(`

  -- HR users (simplified — extend with full auth in production)
  CREATE TABLE IF NOT EXISTS hr_users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  -- Interview sessions
  CREATE TABLE IF NOT EXISTS sessions (
    id                  TEXT PRIMARY KEY,
    candidate_name      TEXT,
    candidate_email     TEXT,
    role                TEXT NOT NULL,
    detected_level      TEXT,           -- fresher | intermediate | experienced
    level_confidence    INTEGER,
    level_reason        TEXT,
    recruiter_email     TEXT,
    status              TEXT DEFAULT 'created',
    -- created | analysed | scheduled | waiting | active | completed | no_show | failed
    jd_text             TEXT,
    resume_text         TEXT,
    jd_blob_url         TEXT,
    resume_blob_url     TEXT,
    key_skills          TEXT,           -- JSON array
    missing_skills      TEXT,           -- JSON array
    technical_stack     TEXT,           -- JSON array
    jd_match_score      INTEGER,
    analysis_summary    TEXT,
    teams_meeting_url   TEXT,
    teams_meeting_id    TEXT,
    interview_link      TEXT,           -- direct link if Teams not configured
    scheduled_at        TEXT,
    started_at          TEXT,
    ended_at            TEXT,
    duration_seconds    INTEGER,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
  );

  -- Generated question plan for each session
  CREATE TABLE IF NOT EXISTS questions (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    question_number INTEGER NOT NULL,
    question_text   TEXT NOT NULL,
    question_type   TEXT,   -- technical | behavioral | situational | motivational
    topic           TEXT,
    depth           TEXT,   -- surface | medium | deep
    target_skill    TEXT,
    scoring_criteria TEXT,
    followup_triggers TEXT, -- JSON array of keywords
    created_at      TEXT DEFAULT (datetime('now'))
  );

  -- Candidate answers with per-dimension scoring
  CREATE TABLE IF NOT EXISTS answers (
    id                    TEXT PRIMARY KEY,
    session_id            TEXT NOT NULL REFERENCES sessions(id),
    question_id           TEXT REFERENCES questions(id),
    question_number       INTEGER,
    question_text         TEXT,
    answer_text           TEXT,
    is_followup           INTEGER DEFAULT 0,
    followup_trigger      TEXT,
    technical_score       REAL,
    depth_score           REAL,
    clarity_score         REAL,
    problem_solving_score REAL,
    overall_score         REAL,
    evaluation_note       TEXT,
    keywords_detected     TEXT,  -- JSON array
    needs_followup        INTEGER DEFAULT 0,
    followup_question     TEXT,
    followup_reason       TEXT,
    answered_at           TEXT DEFAULT (datetime('now')),
    audio_url             TEXT
  );

  -- Final evaluation reports
  CREATE TABLE IF NOT EXISTS reports (
    id                    TEXT PRIMARY KEY,
    session_id            TEXT UNIQUE NOT NULL REFERENCES sessions(id),
    overall_score         REAL,
    technical_avg         REAL,
    depth_avg             REAL,
    clarity_avg           REAL,
    problem_solving_avg   REAL,
    verdict               TEXT,
    -- STRONGLY_RECOMMENDED | RECOMMENDED | NEEDS_FURTHER_REVIEW | NOT_RECOMMENDED
    verdict_confidence    INTEGER,
    executive_summary     TEXT,
    ai_justification      TEXT,
    strengths             TEXT,  -- JSON array
    gaps                  TEXT,  -- JSON array
    stage2_focus_areas    TEXT,  -- JSON array
    salary_band           TEXT,
    transcript            TEXT,  -- JSON array
    failed_questions      TEXT,  -- JSON array (for rejection evidence)
    report_pdf_url        TEXT,
    generated_at          TEXT DEFAULT (datetime('now'))
  );

  -- Audit log — every significant action
  CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT PRIMARY KEY,
    session_id  TEXT,
    event       TEXT NOT NULL,
    detail      TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

`);

// ─── Helper functions ─────────────────────────────────────────────────────────

function getSession(id) {
  return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
}

function updateSession(id, fields) {
  const keys = Object.keys(fields).map(k => `${k} = ?`).join(", ");
  const vals = [...Object.values(fields), new Date().toISOString(), id];
  db.prepare(`UPDATE sessions SET ${keys}, updated_at = ? WHERE id = ?`).run(...vals);
}

function insertAuditLog(sessionId, event, detail = "") {
  const { v4: uuid } = require("uuid");
  db.prepare("INSERT INTO audit_log (id, session_id, event, detail) VALUES (?, ?, ?, ?)").run(
    uuid(), sessionId, event, detail
  );
}

module.exports = { db, getSession, updateSession, insertAuditLog };

// Run directly to init DB
if (require.main === module) {
  console.log("✓ Database initialized at", DB_PATH);
  db.close();
}