#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Build & Deploy to Cloud Run
# ============================================================
# Usage:
#   ./scripts/deploy.sh PROJECT_ID [REGION] [SERVICE_NAME]
#   ./scripts/deploy.sh my-project-id us-central1 multitenant-api
# ============================================================

PROJECT_ID="${1:?Usage: $0 PROJECT_ID [REGION] [SERVICE_NAME]}"
REGION="${2:-us-central1}"
SERVICE_NAME="${3:-multitenant-api}"

IMAGE_TAG="$(git rev-parse --short HEAD 2>/dev/null || echo latest)"
REPO="$REGION-docker.pkg.dev/$PROJECT_ID/multitenant-app"
IMAGE="$REPO/$SERVICE_NAME:$IMAGE_TAG"
DATABASE_URL_SECRET="projects/$PROJECT_ID/secrets/database-url/versions/latest"
REDIS_URL_SECRET="projects/$PROJECT_ID/secrets/redis-url/versions/latest"
JWT_ACCESS_SECRET="projects/$PROJECT_ID/secrets/jwt-access-secret/versions/latest"
JWT_REFRESH_SECRET="projects/$PROJECT_ID/secrets/jwt-refresh-secret/versions/latest"

echo "=== Deploying $SERVICE_NAME to $REGION ==="

# ── Authenticate Docker ─────────────────────────────────────
gcloud auth configure-docker "$REGION-docker.pkg.dev"

# ── Build & Push ──────────────────────────────────────────
echo "Building image: $IMAGE"
docker build -t "$IMAGE" .
docker push "$IMAGE"

# ── Deploy to Cloud Run ──────────────────────────────────
echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image="$IMAGE" \
  --platform=managed \
  --region="$REGION" \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=0 \
  --max-instances=10 \
  --concurrency=80 \
  --timeout=300 \
  --set-env-vars="NODE_ENV=production" \
  --update-secrets="DATABASE_URL=database-url:latest" \
  --update-secrets="REDIS_URL=redis-url:latest" \
  --update-secrets="JWT_ACCESS_SECRET=jwt-access-secret:latest" \
  --update-secrets="JWT_REFRESH_SECRET=jwt-refresh-secret:latest" \
  --add-cloudsql-instances="$PROJECT_ID:$REGION:multitenant-db" \
  --vpc-connector=multitenant-connector \
  --vpc-egress=private-ranges-only \
  --allow-unauthenticated \
  --ingress=all \
  --service-account="$PROJECT_ID-compute@developer.gserviceaccount.com"

echo "=== Deploy complete ==="
gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)"
