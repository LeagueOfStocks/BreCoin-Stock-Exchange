import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

# Get connection string from environment variables
DATABASE_URL = os.environ.get('DATABASE_URL')

def get_connection():
    """Get a PostgreSQL connection using connection string"""
    return psycopg2.connect(DATABASE_URL)

def get_dict_connection():
    """Get a PostgreSQL connection that returns results as dictionaries"""
    conn = get_connection()
    conn.cursor_factory = RealDictCursor
    return conn