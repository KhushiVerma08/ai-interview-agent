const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { db } = require('../config/db');
const logger = require('../config/logger');

// Basic Auth Middleware
const basicAuth = (req, res, next) => {
  const hrPass = process.env.HR_PASSWORD;
  if (!hrPass) return next(); // Skip if password is not configured in .env
  
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  if (password === hrPass) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="HR Dashboard"');
  res.status(401).send('Authentication required.');
};

router.use(basicAuth);

// GET /api/hr/sessions - List all sessions
router.get('/sessions', (req, res) => {
  try {
    const sessions = db.prepare('SELECT s.id, s.candidate_name, s.candidate_email, s.role, s.detected_level, s.status, r.overall_score FROM sessions s LEFT JOIN reports r ON s.id = r.session_id ORDER BY s.created_at DESC').all();
    res.json({ success: true, sessions });
  } catch (err) {
    logger.error('Failed to fetch HR sessions', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/hr/report/:id - Get a specific report
router.get('/report/:id', (req, res) => {
  try {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    
    const report = db.prepare('SELECT * FROM reports WHERE session_id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found for this session' });
    
    // Combine session and report info for the frontend
    res.json({ 
      success: true, 
      report: {
        ...report,
        candidate_name: session.candidate_name,
        candidate_email: session.candidate_email,
        role: session.role,
        duration_seconds: session.duration_seconds
      }
    });
  } catch (err) {
    logger.error('Failed to fetch HR report', { sessionId: req.params.id, error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/hr/report/:id/pdf - Download the PDF report
router.get('/report/:id/pdf', (req, res) => {
  try {
    const report = db.prepare('SELECT report_pdf_url, session_id FROM reports WHERE session_id = ?').get(req.params.id);
    if (!report || !report.report_pdf_url) {
      return res.status(404).send('PDF not available for this report.');
    }
    
    if (fs.existsSync(report.report_pdf_url)) {
      res.download(report.report_pdf_url);
    } else {
      res.status(404).send('PDF file not found on disk.');
    }
  } catch (err) {
    logger.error('Failed to download PDF', { sessionId: req.params.id, error: err.message });
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
