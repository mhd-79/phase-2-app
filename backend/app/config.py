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

    # --- Super Admin / multi-tenant platform (see superadmin.md) ---
    SUPER_ADMIN_EMAIL: str = os.getenv("SUPER_ADMIN_EMAIL", "").strip().lower()        # bootstrap account; no default password exists
    SUPER_ADMIN_PASSWORD: str = os.getenv("SUPER_ADMIN_PASSWORD", "")
    SUPER_ADMIN_NAME: str = os.getenv("SUPER_ADMIN_NAME", "Platform Super Admin").strip()
    FRONTEND_BASE_URL: str = os.getenv("FRONTEND_BASE_URL", "http://localhost:4200").strip().rstrip("/")   # used in invitation links
    INVITATION_EXPIRY_HOURS: int = int(os.getenv("INVITATION_EXPIRY_HOURS", "72"))
    DEFAULT_TRIAL_DAYS: int = int(os.getenv("DEFAULT_TRIAL_DAYS", "14"))
    TRIAL_REMINDER_DAYS: int = int(os.getenv("TRIAL_REMINDER_DAYS", "3"))               # "trial ending soon" notifications
    EXPIRED_ACCESS_POLICY: str = os.getenv("EXPIRED_ACCESS_POLICY", "readonly").strip().lower()   # readonly | block
    # Optional direct (non-pooled) connection string used only to create a new tenant's tables. When empty, the pooled
    # host name is converted automatically (Neon: "-pooler" is removed). Poolers drop the per-schema setting that
    # `prisma db push` relies on, which makes it try to create the tables in the main schema instead.
    DIRECT_DATABASE_URL: str = os.getenv("DIRECT_DATABASE_URL", "").strip()
    TENANT_CLIENT_POOL_SIZE: int = int(os.getenv("TENANT_CLIENT_POOL_SIZE", "20"))      # max simultaneously connected tenant DB clients
    TENANT_CONNECTION_LIMIT: int = int(os.getenv("TENANT_CONNECTION_LIMIT", "3"))       # DB connections per tenant client
    PAYMENT_PROVIDER: str = os.getenv("PAYMENT_PROVIDER", "none").strip().lower()       # none | dev (dev simulates success; never use in production)
    # Outgoing email (every email goes through app/mailer.py). Local development uses MailHog: SMTP_HOST=localhost, SMTP_PORT=1025,
    # no username / password (web UI http://localhost:8025). Any other SMTP provider is a change of these variables only.
    SMTP_HOST: str = os.getenv("SMTP_HOST", "").strip()
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME: str = (os.getenv("SMTP_USERNAME") or os.getenv("SMTP_USER") or "").strip()          # SMTP_USER: name used by earlier releases
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM_EMAIL: str = (os.getenv("SMTP_FROM_EMAIL") or os.getenv("SMTP_FROM") or "").strip()      # SMTP_FROM: name used by earlier releases
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "Okuto Mart").strip()
    # STARTTLS is used whenever the server offers it. A server that does not offer it (MailHog) is used as is, but only when no login
    # is configured: credentials are never sent over an unencrypted connection.
    SMTP_TLS: bool = os.getenv("SMTP_TLS", "true").strip().lower() not in ("0", "false", "no", "off")

settings = Settings()
# names used by earlier releases still work when the new ones are empty or missing (an empty SMTP_USERNAME= line counts as missing)
if not settings.SMTP_USERNAME:
    settings.SMTP_USERNAME = os.getenv("SMTP_USER", "").strip()
if not settings.SMTP_FROM_EMAIL:
    settings.SMTP_FROM_EMAIL = os.getenv("SMTP_FROM", "").strip()


