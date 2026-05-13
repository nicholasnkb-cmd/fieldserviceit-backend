#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR/backend"

echo "=== Backend Build ==="

npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy 2>/dev/null || npx prisma db push
npx nest build

echo "Backend build complete. Entry: dist/src/main.js"
