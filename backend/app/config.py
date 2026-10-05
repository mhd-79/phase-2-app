import os
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
    PROJECT_NAME: str = "Okuto Mart POS & Billing System (Phase 2)"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "okuto-mart-pos-super-secret-key-phase-2-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12 # 12 hours
    DATABASE_URL: str = os.getenv("DATABASE_URL", raw_db_url or "postgresql://postgres:postgres@localhost:5432/okuto_mart_p2")
    AZURE_STORAGE_CONNECTION_STRING: str = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
    # OKUTO IQ chatbot (Phase 2 admin). Plug-in/plug-out switch + local Ollama LLM (no external AI service, no API key).
    AI_CHATBOT_ENABLED: bool = os.getenv("AI_CHATBOT_ENABLED", "true").strip().lower() not in ("0", "false", "no", "off")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").strip().rstrip("/")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.2:3b").strip()
    OKUTO_IQ_PERIOD_DAYS: int = int(os.getenv("OKUTO_IQ_PERIOD_DAYS", "30"))   # length of one activation / renewal
    OLLAMA_TIMEOUT_SECONDS: float = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "120"))

settings = Settings()


