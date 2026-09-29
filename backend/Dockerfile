FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATABASE_URL="postgresql://postgres:XAFLEVfbowMOWMCwWEUUoDniKYxXSjzC@postgres.railway.internal:5432/railway" \
    SECRET_KEY="greenfield-mart-pos-super-secret-key-phase-1-2026"

RUN apt-get update && apt-get install -y --no-install-recommends \
    libatomic1 \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN python -m prisma generate --schema=./prisma/schema.prisma
RUN python -m prisma py fetch

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
ENTRYPOINT ["./docker-entrypoint.sh"]


EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]