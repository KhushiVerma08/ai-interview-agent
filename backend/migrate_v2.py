import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "interview_agent.db")

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    def add_column_if_not_exists(table, col, def_type):
        cursor.execute(f"PRAGMA table_info({table})")
        cols = [row[1] for row in cursor.fetchall()]
        if col not in cols:
            print(f"Adding {col} to {table}...")
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {def_type}")
            
    add_column_if_not_exists("questions", "status", "VARCHAR DEFAULT 'pending'")
    add_column_if_not_exists("answers", "confidence_score", "FLOAT")
    add_column_if_not_exists("answers", "communication_score", "FLOAT")
    add_column_if_not_exists("reports", "confidence_avg", "FLOAT")
    add_column_if_not_exists("reports", "communication_avg", "FLOAT")
    add_column_if_not_exists("reports", "competency_score", "FLOAT")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
