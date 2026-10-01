import os
<<<<<<< Updated upstream
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load environment variables from .env file if present
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)
load_dotenv() # also load from current working directory

raw_db_url = os.getenv("DATABASE_URL", "").strip()
if raw_db_url:
    os.environ["DATABASE_URL"] = raw_db_url

class Settings(BaseSettings):
    PROJECT_NAME: str = "Okuto Mart POS & Billing System (Phase 1)"
=======
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

load_dotenv()

class Settings(BaseSettings):
    PROJECT_NAME: str = "Okuto Mart POS & Billing System (Phase 2)"
>>>>>>> Stashed changes
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "okuto-mart-pos-super-secret-key-phase-2-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12 # 12 hours
<<<<<<< Updated upstream
    DATABASE_URL: str = os.getenv("DATABASE_URL", raw_db_url)
=======
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/okuto_mart_p2")
>>>>>>> Stashed changes
    AZURE_STORAGE_CONNECTION_STRING: str = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")

settings = Settings()


