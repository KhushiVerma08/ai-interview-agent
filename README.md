# AI Interview Agent

An AI-Powered Adaptive First-Round Interview Agent built with modern web technologies, enabling fully automated, conversational interviews within Microsoft Teams using Recall.ai.

## Overview

This project is a sophisticated AI agent designed to conduct dynamic first-round technical and behavioral interviews. HR creates sessions from a dashboard, candidates receive invites to Microsoft Teams, and an automated Recall.ai bot joins the meeting to conduct and score the interview in real-time.

## Tech Stack
- **Frontend**: React, Vite, Tailwind CSS
- **Backend**: Python, FastAPI, SQLAlchemy
- **Database**: PostgreSQL (Supabase)
- **AI Models**: Google Gemini / Anthropic Claude
- **Meeting Bot**: Recall.ai

## Key Features
- **HR Dashboard**: A centralized portal to create sessions, upload JDs/Resumes, and review scores.
- **Automated Bot Spawning**: The backend continuously polls and automatically spawns a Recall.ai bot into the Teams meeting 5 minutes before the scheduled start time.
- **Dynamic Interview Generation**: LLMs analyze the Job Description and Candidate Resume to generate a tailored 5-question interview plan, including technical threshold tracking and follow-up generation.
- **Real-Time Evaluation**: As the candidate speaks to the Recall bot, the backend webhook processes transcripts statelessly, scores answers, and triggers dynamic follow-ups if the candidate struggles.
- **Automated Data Retention**: A background cron task automatically purges sessions and PII older than 90 days.

## Folder Structure

```text
ai-interview-agent/
├── backend/            # Python FastAPI Backend
│   ├── services/       # Integrations (Recall.ai, LLM Logic, Teams)
│   ├── database.py     # SQLAlchemy models & DB connection
│   ├── main.py         # FastAPI application, background tasks, webhooks
│   └── requirements.txt
├── frontend/           # React + Vite Frontend
│   ├── src/
│   │   ├── components/ # React components (Dashboard, Candidate view)
│   │   ├── utils/      # API helpers
│   │   └── App.jsx     # Main Router
│   ├── index.css       # Tailwind entry
│   └── package.json
├── uploads/            # Temporary file storage (purged automatically)
├── .env                # Environment secrets
└── README.md
```

## Setup & Local Development

### 1. Prerequisites
- Python 3.9+
- Node.js 18+
- A Supabase PostgreSQL instance
- API Keys for Google Gemini (or Anthropic) and Recall.ai

### 2. Environment Configuration
Copy `env.example` to `.env` in the root folder and add your secrets:
```env
# AI Models
GEMINI_API_KEY="your_gemini_key"

# Database
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_KEY="your_supabase_key"

# Integrations
RECALL_API_KEY="your_recall_api_key"
APP_BASE_URL="http://localhost:8000" # Or your Ngrok/Production URL for webhooks
```

### 3. Backend Setup
```bash
cd backend
python -m venv .venv
# Activate the venv (Windows: .venv\Scripts\activate, Mac: source .venv/bin/activate)
pip install -r requirements.txt
python -m uvicorn main:app --reload
```
*The backend runs on `http://localhost:8000`.*

### 4. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*The frontend runs on `http://localhost:3000`.*
