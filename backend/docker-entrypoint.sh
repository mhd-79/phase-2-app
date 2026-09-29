#!/bin/sh
set -e

echo "Syncing schema to Railway PostgreSQL..."
python -m prisma db push --schema=./prisma/schema.prisma --accept-data-loss

if [ "$RUN_SEED" = "true" ]; then
  echo "Seeding database..."
  python seed_db.py
fi

exec "$@"