#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR/frontend"

echo "=== Frontend Build ==="

npm ci --omit=dev
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/ 2>/dev/null || true

echo "Frontend build complete. Entry: .next/standalone/server.js"
