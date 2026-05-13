#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma generate

if ls prisma/migrations/*/migration.sql 1>/dev/null 2>&1; then
  echo "Applying existing migrations..."
  npx prisma migrate deploy
else
  echo "No migration files found — pushing schema directly (dev mode)..."
  npx prisma db push --accept-data-loss
fi

if [ "$SEED_DB" = "true" ]; then
  echo "Seeding database..."
  npx ts-node prisma/seed.ts
fi

echo "Starting application..."
exec "$@"
