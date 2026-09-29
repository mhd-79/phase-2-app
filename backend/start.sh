#!/bin/sh
set -e

echo "Running prisma db push to sync schema with Railway PostgreSQL..."
python -m prisma db push --skip-generate

echo "Starting FastAPI backend..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
