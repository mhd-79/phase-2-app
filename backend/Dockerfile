FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Generate Prisma client at build time (no DB needed)
RUN prisma generate

RUN chmod +x docker-entrypoint.sh start.sh

EXPOSE 8000

# docker-entrypoint.sh runs `python -m prisma db push` then starts uvicorn
CMD ["sh", "./docker-entrypoint.sh"]
