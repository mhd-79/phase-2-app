import os
from pydantic_settings import BaseSettings

DEFAULT_DATABASE_URL = "postgresql://neondb_owner:npg_PS89oKVngfra@ep-soft-night-b38dkdev-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = DEFAULT_DATABASE_URL

class Settings(BaseSettings):
    PROJECT_NAME: str = "Greenfield Mart POS & Billing System (Phase 1)"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "greenfield-mart-pos-super-secret-key-phase-1-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12 # 12 hours
    DATABASE_URL: str = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
    AZURE_STORAGE_CONNECTION_STRING: str = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")

settings = Settings()

