from database import engine
from sqlalchemy import text

conn = engine.connect()
try:
    conn.execute(text("ALTER TABLE sessions ADD COLUMN bot_status VARCHAR DEFAULT 'pending';"))
    conn.commit()
    print("Migration successful")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
