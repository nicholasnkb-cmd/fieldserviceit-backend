#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Running Prisma migrations..."
npx prisma generate
npx prisma migrate deploy 2>/dev/null || npx prisma db push

echo "Starting backend..."
exec node dist/src/main.js
