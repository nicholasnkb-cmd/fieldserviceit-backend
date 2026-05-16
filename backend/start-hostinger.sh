#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Starting backend..."
exec node dist/main.js
