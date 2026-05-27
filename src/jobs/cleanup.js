const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../data/interview_agent.db');
const uploadsDir = path.join(__dirname, '../../uploads/sessions');

const db = new Database(dbPath);

function cleanupOldSessions(daysOld = 90) {
  return new Promise((resolve, reject) => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      const cutoffIso = cutoffDate.toISOString();

      console.log(`Starting cleanup of sessions older than ${cutoffIso} (${daysOld} days)`);

      const rows = db.prepare(`SELECT id FROM sessions WHERE created_at < ?`).all(cutoffIso);

      if (!rows || rows.length === 0) {
        console.log('No sessions found to clean up.');
        return resolve();
      }

      console.log(`Found ${rows.length} sessions to delete.`);

      // Wrap in a transaction
      const deleteSession = db.transaction((sessionId) => {
        db.prepare(`DELETE FROM answers WHERE session_id = ?`).run(sessionId);
        db.prepare(`DELETE FROM questions WHERE session_id = ?`).run(sessionId);
        db.prepare(`DELETE FROM reports WHERE session_id = ?`).run(sessionId);
        db.prepare(`DELETE FROM audit_log WHERE session_id = ?`).run(sessionId);
        db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
      });

      rows.forEach(row => {
        const sessionId = row.id;
        const sessionDir = path.join(uploadsDir, sessionId);

        // Delete files in directory
        if (fs.existsSync(sessionDir)) {
          try {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            console.log(`Deleted directory for session: ${sessionId}`);
          } catch (e) {
            console.error(`Failed to delete directory ${sessionDir}:`, e);
          }
        }

        // Delete from all tables
        deleteSession(sessionId);
        console.log(`Deleted session ${sessionId} from DB`);
      });
      
      console.log('Cleanup job finished successfully.');
      resolve();
    } catch (e) {
      console.error('Error during cleanup:', e);
      reject(e);
    }
  });
}

// Run if called directly
if (require.main === module) {
  cleanupOldSessions(90)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { cleanupOldSessions };
