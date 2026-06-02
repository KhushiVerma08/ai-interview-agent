import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "interview_agent.db")

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE sessions ADD COLUMN current_question_index INTEGER DEFAULT 1")
    print("Added current_question_index column.")
except sqlite3.OperationalError as e:
    print("Column may already exist:", e)

for table in ["hr_users", "audit_log", "interview_sessions", "interview_questions"]:
    cursor.execute(f"DROP TABLE IF EXISTS {table}")
    print(f"Dropped table {table}")

conn.commit()
conn.close()
print("Migration completed successfully.")
