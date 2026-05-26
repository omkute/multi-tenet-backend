#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# One-Time GCP Setup Script
# ============================================================
# Prerequisites:
#   1. gcloud CLI installed and authenticated (gcloud auth login)
#   2. Billing enabled on the project
#   3. Required APIs enabled
#
# Usage:
#   ./scripts/setup-gcp.sh PROJECT_ID [REGION]
#   ./scripts/setup-gcp.sh my-project-id us-central1
# ============================================================

PROJECT_ID="${1:?Usage: $0 PROJECT_ID [REGION]}"
REGION="${2:-us-central1}"
DB_PASS="${3:-$(openssl rand -base64 32)}"
REDIS_PASS=""

echo "=== Setting up GCP project: $PROJECT_ID ==="

# ── Project & APIs ──────────────────────────────────────────
gcloud config set project "$PROJECT_ID"

echo "Enabling required APIs..."
gcloud services enable \
  cloudresourcemanager.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  vpcaccess.googleapis.com \
  compute.googleapis.com \
  servicenetworking.googleapis.com

# ── VPC & Serverless VPC Connector ──────────────────────────
echo "Creating VPC..."
gcloud compute networks create multitenant-vpc \
  --subnet-mode=custom \
  --bgp-routing-mode=regional || true

gcloud compute networks subnets create multitenant-subnet \
  --network=multitenant-vpc \
  --region="$REGION" \
  --range=10.0.0.0/28 || true

echo "Creating Serverless VPC Connector..."
gcloud compute networks vpc-access connectors create multitenant-connector \
  --region="$REGION" \
  --network=multitenant-vpc \
  --range=10.0.1.0/28 || true

# Reserve IP range for Private Service Access (needed for Memorystore)
gcloud compute addresses create google-managed-services-range \
  --global \
  --prefix-length=16 \
  --network=multitenant-vpc \
  --purpose=VPC_PEERING || true

gcloud services vpc-peerings connect \
  --service=servicenetworking.googleapis.com \
  --network=multitenant-vpc \
  --ranges=google-managed-services-range || true

# ── Cloud SQL (PostgreSQL 16) ───────────────────────────────
echo "Creating Cloud SQL instance..."
gcloud sql instances create multitenant-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region="$REGION" \
  --network=multitenant-vpc \
  --no-assign-ip \
  --authorized-networks="" \
  --root-password="$DB_PASS"

gcloud sql databases create multitenant \
  --instance=multitenant-db

INSTANCE_CONNECTION_NAME="$PROJECT_ID:$REGION:multitenant-db"

# ── Memorystore (Redis 7) ──────────────────────────────────
echo "Creating Memorystore instance..."
gcloud redis instances create multitenant-redis \
  --size=1 \
  --region="$REGION" \
  --redis-version=redis_7_0 \
  --network=multitenant-vpc \
  --connect-mode=private-service-access

REDIS_IP=$(gcloud redis instances describe multitenant-redis \
  --region="$REGION" --format="value(host)")

# ── Artifact Registry ───────────────────────────────────────
echo "Creating Artifact Registry repository..."
gcloud artifacts repositories create multitenant-app \
  --repository-format=docker \
  --location="$REGION" \
  --description="Multi-tenant backend images"

# ── Secret Manager ──────────────────────────────────────────
echo "Creating secrets..."
echo -n "$DB_PASS" | gcloud secrets create db-password --data-file=-
echo -n "postgresql://postgres:${DB_PASS}@/${PROJECT_ID}:${REGION}:multitenant-db?host=/cloudsql/${INSTANCE_CONNECTION_NAME}" \
  | gcloud secrets create database-url --data-file=-
echo -n "redis://${REDIS_IP}:6379" | gcloud secrets create redis-url --data-file=-
echo -n "$(openssl rand -base64 48)" | gcloud secrets create jwt-access-secret --data-file=-
echo -n "$(openssl rand -base64 48)" | gcloud secrets create jwt-refresh-secret --data-file=-

# Grant Cloud Run service account access to secrets
CLOUDRUN_SA="$PROJECT_ID-compute@developer.gserviceaccount.com"
for SECRET in db-password database-url redis-url jwt-access-secret jwt-refresh-secret; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:$CLOUDRUN_SA" \
    --role="roles/secretmanager.secretAccessor"
done

# ── IAM permissions for Cloud Run ───────────────────────────
echo "Granting IAM permissions..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$CLOUDRUN_SA" \
  --role="roles/cloudsql.client"

# ── Output ──────────────────────────────────────────────────
echo ""
echo "=== Setup Complete ==="
echo "Cloud SQL Instance:    $INSTANCE_CONNECTION_NAME"
echo "Redis Private IP:      $REDIS_IP"
echo "Artifact Registry:     $REGION-docker.pkg.dev/$PROJECT_ID/multitenant-app"
echo ""
echo "Next steps:"
echo "  1. Run prisma migrate:  ./scripts/run-migrations.sh $PROJECT_ID"
echo "  2. Deploy app:          ./scripts/deploy.sh $PROJECT_ID"
echo ""
