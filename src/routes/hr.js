const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { db } = require('../config/db');
const logger = require('../config/logger');

// Token Auth Logic
const activeTokens = new Set();

const requireAuthToken = (req, res, next) => {
  const hrPass = process.env.HR_PASSWORD;
  if (!hrPass) return next(); // Skip if password is not configured

  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (activeTokens.has(token)) {
      return next();
    }
  }

  // Allow basicAuth as fallback for existing static routes/PDF downloads if needed
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
  if (password === hrPass) {
    return next();
  }

  res.status(401).json({ success: false, error: 'Authentication required or token expired' });
};

// POST /api/hr/login - Authenticate HR user
router.post('/login', (req, res) => {
  const { password } = req.body;
  const hrPass = process.env.HR_PASSWORD;
  
  if (!hrPass || password === hrPass) {
    const { v4: uuid } = require('uuid');
    const token = uuid();
    activeTokens.add(token);
    return res.json({ success: true, token });
  }
  
  res.status(401).json({ success: false, error: 'Invalid password' });
});

router.use(requireAuthToken);


// GET /api/hr/sessions - List all sessions
router.get('/sessions', async (req, res) => {
  try {
    const sessions = db.prepare('SELECT s.id, s.candidate_name, s.candidate_email, s.role, s.detected_level, s.status, s.teams_meeting_url, s.scheduled_at, s.created_at, r.overall_score as report_score, r.verdict as report_verdict FROM sessions s LEFT JOIN reports r ON s.id = r.session_id ORDER BY s.created_at DESC').all();
    res.json({ success: true, sessions });
  } catch (err) {
    logger.error('Failed to fetch HR sessions', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// GET /api/hr/report/:id - Get a specific report
router.get('/report/:id', async (req, res) => {
  try {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    
    const report = db.prepare('SELECT * FROM reports WHERE session_id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found for this session' });
    
    // Parse JSON fields from SQLite back to objects
    report.strengths = report.strengths ? JSON.parse(report.strengths) : [];
    report.gaps = report.gaps ? JSON.parse(report.gaps) : [];
    report.stage2_focus_areas = report.stage2_focus_areas ? JSON.parse(report.stage2_focus_areas) : [];
    report.transcript = report.transcript ? JSON.parse(report.transcript) : [];
    report.failed_questions = report.failed_questions ? JSON.parse(report.failed_questions) : [];

    // Combine session and report info for the frontend
    res.json({
      success: true,
      data: {
        session,
        report
      }
    });
  } catch (err) {
    logger.error('Failed to fetch report', { sessionId: req.params.id, error: err.message });
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// GET /api/hr/report/:id/pdf - Download the PDF report
router.get('/report/:id/pdf', async (req, res) => {
  try {
    const report = db.prepare('SELECT report_pdf_url, session_id FROM reports WHERE session_id = ?').get(req.params.id);
    if (!report || !report.report_pdf_url) {
      return res.status(404).send('PDF not available for this report.');
    }
    
    // Security check: ensure the path is within the reports directory
    const resolvedPath = path.resolve(report.report_pdf_url);
    if (!resolvedPath.startsWith(path.resolve('./reports'))) {
      return res.status(403).send('Forbidden file access.');
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).send('PDF file no longer exists on disk.');
    }

    res.download(resolvedPath, `Report_${report.session_id}.pdf`);
  } catch (err) {
    logger.error('Failed to download PDF', { sessionId: req.params.id, error: err.message });
    res.status(500).send('Internal Server Error');
  }
});

// GET /api/hr/transcript/:id - Download the transcript as a text file
router.get('/transcript/:id', async (req, res) => {
  try {
    const report = db.prepare('SELECT transcript, session_id, generated_at FROM reports WHERE session_id = ?').get(req.params.id);
    if (!report || !report.transcript) {
      return res.status(404).send('Transcript not available for this session.');
    }
    
    const session = db.prepare('SELECT candidate_name FROM sessions WHERE id = ?').get(req.params.id);
    const candidateName = session?.candidate_name || 'Candidate';
    const transcriptArray = JSON.parse(report.transcript);
    
    let transcriptText = `Interview Transcript: ${candidateName}\nSession ID: ${req.params.id}\nDate: ${report.generated_at ? new Date(report.generated_at).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')}\n\n`;
    transcriptText += "========================================================\n\n";
    
    transcriptArray.forEach(entry => {
      const roleStr = entry.role === 'ai' ? 'AI Agent' : candidateName;
      const timeStr = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('en-IN') : '';
      transcriptText += `[${timeStr}] ${roleStr}:\n${entry.text}\n\n`;
    });
    
    res.setHeader('Content-disposition', `attachment; filename=Transcript_${candidateName.replace(/\\s+/g, '_')}_${req.params.id}.txt`);
    res.setHeader('Content-type', 'text/plain');
    res.send(transcriptText);
  } catch (err) {
    logger.error('Failed to download transcript', { sessionId: req.params.id, error: err.message });
    res.status(500).send('Internal Server Error');
  }
});

module.exports = { router, requireAuthToken };
