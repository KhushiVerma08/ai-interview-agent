import os
import sqlite3
import psycopg2
from psycopg2.extras import DictCursor

# The SQLite database path
SQLITE_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "interview_agent.db")

# This will be populated with the actual password via env var or manual entry
SUPABASE_URL = os.environ.get("SUPABASE_DATABASE_URL", "postgresql://postgres:bellurbis%40ai-interview-agent@db.ppenztmwjgwtuafwesvg.supabase.co:5432/postgres")

def migrate_data():
    print("Connecting to SQLite...")
    sl_conn = sqlite3.connect(SQLITE_DB_PATH)
    sl_conn.row_factory = sqlite3.Row
    sl_cur = sl_conn.cursor()

    print("Connecting to Supabase Postgres...")
    try:
        pg_conn = psycopg2.connect(SUPABASE_URL)
        pg_cur = pg_conn.cursor()
    except Exception as e:
        print(f"Failed to connect to Postgres: {e}")
        return

    # Tables to migrate
    tables = ["sessions", "questions", "answers", "reports"]

    for table in tables:
        print(f"\nMigrating table: {table}...")
        # Get data from SQLite
        sl_cur.execute(f"SELECT * FROM {table}")
        rows = sl_cur.fetchall()
        
        if not rows:
            print(f"  No data found in {table}.")
            continue

        columns = rows[0].keys()
        col_names = ", ".join(columns)
        placeholders = ", ".join(["%s"] * len(columns))

        insert_query = f"INSERT INTO {table} ({col_names}) VALUES ({placeholders}) ON CONFLICT DO NOTHING;"
        
        count = 0
        for row in rows:
            values = tuple(row)
            pg_cur.execute(insert_query, values)
            count += 1
            
        pg_conn.commit()
        print(f"  Successfully inserted {count} rows into {table}.")

    print("\nMigration completed successfully!")
    pg_cur.close()
    pg_conn.close()
    sl_conn.close()

if __name__ == "__main__":
    if "[YOUR-PASSWORD]" in SUPABASE_URL:
        print("ERROR: Please replace [YOUR-PASSWORD] with your actual Supabase database password in the SUPABASE_URL.")
    else:
        migrate_data()
