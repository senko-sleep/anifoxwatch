#!/usr/bin/env bash
# Deploy to Cloud Run from server/ directory (Dockerfile build).
# Prerequisites: gcloud auth login; export GCP_PROJECT=your-project-id
set -euo pipefail

PROJECT="${GCP_PROJECT:-}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${CLOUD_RUN_SERVICE:-anistream-hub-api}"

if [[ -z "$PROJECT" ]]; then
  echo "Set GCP_PROJECT to your Google Cloud project ID." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Project: $PROJECT | Region: $REGION | Service: $SERVICE"
gcloud config set project "$PROJECT"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$PROJECT"

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900 \
  --max-instances 4 \
  --min-instances 0 \
  --set-env-vars "NODE_ENV=production,CORS_ORIGIN=*"

echo "Done. Point VITE_API_URL at the URL printed above."
