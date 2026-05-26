# AI Interview Agent

AI-Powered Adaptive First-Round Interview Agent.

## Overview

This project is an AI-powered agent designed to conduct first-round interviews. It runs a web application that facilitates the entire interview process, from candidate application to interactive assessment and report generation.

## Features
- **Interactive AI Interviewer**: Conducts dynamic, conversational interviews.
- **Resume Parsing & Document Upload**: Candidates can upload resumes and supporting documents.
- **Adaptive Questioning**: Generates personalized questions based on the candidate's resume and ongoing responses.
- **Automated Evaluation**: Evaluates candidates in real-time and calculates a final score.
- **Report Generation**: Automatically generates comprehensive PDF reports for HR.
- **HR Dashboard**: A centralized interface for HR to manage candidates and view interview results.

## Folder Structure

```text
ai-interview-agent/
├── data/               # SQLite database and related data files
├── logs/               # Application log files
├── public/             # Static assets (HTML, CSS, JS) for the frontend web interface
│   ├── css/            # Stylesheets
│   ├── js/             # Client-side JavaScript
│   ├── candidate.html  # Candidate application form
│   ├── index.html      # HR dashboard / Landing page
│   └── interview.html  # Main interactive AI interview interface
├── reports/            # Generated interview PDF reports
├── scratch/            # Temporary processing files
├── src/                # Backend source code
│   ├── config/         # Configuration files (Database, Logger, etc.)
│   ├── jobs/           # Background jobs (e.g., data retention and cleanup)
│   ├── routes/         # Express API routes (HR and Interview endpoints)
│   └── services/       # Core business logic (Claude API integration, Email, PDF generation)
├── tests/              # Automated test suites
├── uploads/            # Uploaded candidate documents (resumes, etc.)
├── .env                # Environment variables (create from env.example)
├── env.example         # Example environment variables template
├── package.json        # Project metadata and Node.js dependencies
└── server.js           # Main Express server entry point
```

## How It Works

1. **Candidate Application**: Candidates navigate to the candidate portal (`candidate.html`) and submit their details along with their resume.
2. **Resume Analysis**: The backend processes the uploaded resume using an AI service (Claude) to extract key skills and experience.
3. **Adaptive Interview**: The candidate enters the interview interface (`interview.html`). The AI agent dynamically asks questions tailored to the candidate's background and evaluates their responses in real-time.
4. **Scoring & Feedback**: The system scores the candidate based on predefined criteria, technical accuracy, and communication skills.
5. **Report Generation**: Once the interview concludes, the system generates a detailed PDF report containing the interview transcript, scores, and AI-driven feedback.
6. **HR Review**: HR personnel can review the candidate's performance and download the generated reports via the HR dashboard (`index.html`).

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment Setup**:
   Create a `.env` file based on `env.example` and fill in the required configurations (e.g., Anthropic API keys, database URLs, etc.).

3. **Start the server**:
   ```bash
   npm start
   ```
   *For development with auto-reload, use `npm run dev`.*

The application will be running at `http://localhost:3000`.
