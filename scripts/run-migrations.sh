#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Run Prisma Migrations Against Cloud SQL
# ============================================================
# Usage:
#   ./scripts/run-migrations.sh PROJECT_ID [REGION]
#   ./scripts/run-migrations.sh my-project-id us-central1
# ============================================================

PROJECT_ID="${1:?Usage: $0 PROJECT_ID [REGION]}"
REGION="${2:-us-central1}"
INSTANCE_CONNECTION_NAME="$PROJECT_ID:$REGION:multitenant-db"

echo "=== Running migrations against Cloud SQL ==="

# Start Cloud SQL Auth Proxy in background
echo "Starting Cloud SQL Auth Proxy..."
cloud-sql-proxy "$INSTANCE_CONNECTION_NAME" &
PROXY_PID=$!
sleep 3

# Set DATABASE_URL for local proxy connection
export DATABASE_URL="postgresql://postgres:$(gcloud secrets versions access latest --secret=db-password)@localhost:5432/multitenant"

# Run migrations
npm run db:deploy

# Stop proxy
kill $PROXY_PID
wait $PROXY_PID 2>/dev/null || true

echo "=== Migrations complete ==="
