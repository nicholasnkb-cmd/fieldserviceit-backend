#!/bin/sh
set -e

echo "Database schema is managed by the application SQL startup checks."
if [ "$SEED_DB" = "true" ]; then
  echo "SEED_DB=true ignored: SQL seed bootstrap is not currently configured."
fi

echo "Starting application..."
exec "$@"
