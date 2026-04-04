#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# deploy-gcloud.sh  –  Build & deploy AniStream API to Cloud Run
# Usage:  bash deploy-gcloud.sh [PROJECT_ID] [REGION]
# ─────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${2:-us-central1}"
SERVICE="anistream-api"
REPO="anistream-hub"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$SERVICE"

if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: No project ID. Pass it as first arg or run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

echo "==> Project  : $PROJECT_ID"
echo "==> Region   : $REGION"
echo "==> Service  : $SERVICE"
echo "==> Image    : $IMAGE"
echo ""

# ── 1. Enable required APIs ───────────────────────────────────
echo "==> Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT_ID"

# ── 2. Create Artifact Registry repo (idempotent) ─────────────
echo "==> Creating Artifact Registry repo '$REPO'..."
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  (already exists)"

# ── 3. Configure Docker auth ──────────────────────────────────
echo "==> Configuring Docker auth..."
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet

# ── 4. Build & push image ──────────────────────────────────────
echo "==> Building Docker image..."
# Run from the server directory (this script lives there)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
docker build -t "$IMAGE:latest" "$SCRIPT_DIR"

echo "==> Pushing image..."
docker push "$IMAGE:latest"

# ── 5. Deploy to Cloud Run ────────────────────────────────────
echo "==> Deploying to Cloud Run..."
gcloud run deploy "$SERVICE" \
  --image="$IMAGE:latest" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=2Gi \
  --cpu=2 \
  --concurrency=80 \
  --min-instances=0 \
  --max-instances=10 \
  --set-env-vars="NODE_ENV=production,CORS_ORIGIN=*" \
  --timeout=60s \
  --project="$PROJECT_ID"

# ── 6. Print service URL ──────────────────────────────────────
URL=$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format='value(status.url)')

echo ""
echo "✅ Deployed successfully!"
echo "   Service URL : $URL"
echo "   Health      : $URL/health"
echo "   API docs    : $URL/api"
echo ""
echo "Run the end-to-end test:"
echo "  API_URL=$URL npx tsx testing/test-cloudrun.ts"
