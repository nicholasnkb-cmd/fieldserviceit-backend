#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../frontend/.next/standalone"
exec node server.js
