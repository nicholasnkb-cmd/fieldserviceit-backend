#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Starting backend..."
if [ ! -f "dist/main.js" ]; then
  echo "dist/main.js missing, running npm run build:tsc..."
  npm run build:tsc
elif find src -type f -newer dist/main.js | grep -q .; then
  echo "Source files are newer than dist/main.js, running npm run build:tsc..."
  npm run build:tsc || echo "Startup compile failed; using existing dist/main.js"
fi

exec node dist/main.js
