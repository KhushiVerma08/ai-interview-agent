// src/jobs/retention.js
// Retention Policy: Deletes sessions, reports, questions, answers, and files older than 12 months (T9.2)

const fs = require("fs");
const path = require("path");
const { db } = require("../config/db");
const logger = require("../config/logger");

const MONTHS_TO_KEEP = 12;

function runRetentionPolicy() {
  logger.info(`Running retention policy: Deleting data older than ${MONTHS_TO_KEEP} months...`);

  // SQLite date manipulation
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - MONTHS_TO_KEEP);
  const cutoffStr = cutoffDate.toISOString();

  try {
    const oldSessions = db.prepare("SELECT id, resume_blob_url, jd_blob_url FROM sessions WHERE created_at < ?").all(cutoffStr);
    
    if (oldSessions.length === 0) {
      logger.info("No expired data found.");
      return;
    }

    logger.info(`Found ${oldSessions.length} expired sessions to delete.`);

    const deleteSession   = db.prepare("DELETE FROM sessions WHERE id = ?");
    const deleteAnswers   = db.prepare("DELETE FROM answers WHERE session_id = ?");
    const deleteQuestions = db.prepare("DELETE FROM questions WHERE session_id = ?");
    const deleteReports   = db.prepare("DELETE FROM reports WHERE session_id = ?");
    const deleteAudits    = db.prepare("DELETE FROM audit_log WHERE session_id = ?");

    const getReport       = db.prepare("SELECT report_pdf_url FROM reports WHERE session_id = ?");

    const transaction = db.transaction((sessions) => {
      for (const session of sessions) {
        const { id, resume_blob_url, jd_blob_url } = session;

        // 1. Delete associated physical files
        const filesToDelete = [];
        if (resume_blob_url) filesToDelete.push(path.join(process.cwd(), resume_blob_url));
        if (jd_blob_url) filesToDelete.push(path.join(process.cwd(), jd_blob_url));

        // Find report PDF
        const reportRow = getReport.get(id);
        if (reportRow && reportRow.report_pdf_url) {
          filesToDelete.push(path.join(process.cwd(), reportRow.report_pdf_url));
        }

        // Delete audio recordings (they follow the naming convention sessionId_*)
        const recordingsDir = path.join(process.cwd(), "uploads", "recordings");
        if (fs.existsSync(recordingsDir)) {
          const files = fs.readdirSync(recordingsDir);
          for (const file of files) {
            if (file.startsWith(id)) {
              filesToDelete.push(path.join(recordingsDir, file));
            }
          }
        }

        for (const file of filesToDelete) {
          if (fs.existsSync(file)) {
            try {
              fs.unlinkSync(file);
            } catch (err) {
              logger.error(`Failed to delete file ${file}`, { error: err.message });
            }
          }
        }

        // 2. Delete database records
        deleteAudits.run(id);
        deleteAnswers.run(id);
        deleteQuestions.run(id);
        deleteReports.run(id);
        deleteSession.run(id);

        logger.info(`Deleted session ${id} and its associated files.`);
      }
    });

    transaction(oldSessions);
    logger.info("Retention policy executed successfully.");

  } catch (err) {
    logger.error("Retention policy failed", { error: err.message });
  }
}

// Allow running directly
if (require.main === module) {
  runRetentionPolicy();
}

module.exports = { runRetentionPolicy };
