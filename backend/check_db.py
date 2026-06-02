import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "interview_agent.db")
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()
cursor.execute("SELECT id, candidate_name, status, scheduled_at, created_at FROM sessions")
rows = cursor.fetchall()
print(f"Total sessions: {len(rows)}")
for r in rows:
    print(r)
conn.close()
