#!/bin/sh
set -e

echo "Running migrations..."
python -m prisma db push --skip-generate

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
