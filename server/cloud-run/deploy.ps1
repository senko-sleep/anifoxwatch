# Deploy AniStream API to Google Cloud Run (builds from ../Dockerfile).
#
# Prerequisites:
#   1. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
#   2. gcloud auth login
#   3. gcloud config set project YOUR_PROJECT_ID
#      Or set env: $env:GCP_PROJECT = "YOUR_PROJECT_ID"
#
# Usage (from repo root or server/):
#   cd server
#   .\cloud-run\deploy.ps1
#   .\cloud-run\deploy.ps1 -ProjectId "my-project" -Region "us-central1" -Service "anistream-hub-api"
#
# After deploy, set optional HiAnime API (recommended):
#   gcloud run services update $Service --region $Region --set-env-vars "HIANIME_API_URL=https://anifoxwatch-api.anifoxwatch.workers.dev"
#
# Smoke test:
#   $env:API_URL = "https://YOUR-SERVICE-XXXX-uc.a.run.app"
#   npx tsx testing/test-cloudrun.ts

param(
    [string] $ProjectId = $env:GCP_PROJECT,
    [string] $Region = $(if ($env:GCP_REGION) { $env:GCP_REGION } else { "us-central1" }),
    [string] $Service = $(if ($env:CLOUD_RUN_SERVICE) { $env:CLOUD_RUN_SERVICE } else { "anistream-hub-api" })
)

$ErrorActionPreference = "Stop"

if (-not $ProjectId) {
    Write-Host "Set GCP_PROJECT or pass -ProjectId (your Google Cloud project ID)." -ForegroundColor Red
    exit 1
}

$ServerRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ServerRoot

Write-Host "Project: $ProjectId | Region: $Region | Service: $Service" -ForegroundColor Cyan
Write-Host "Enabling required APIs (safe to re-run)..." -ForegroundColor Gray
gcloud config set project $ProjectId
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project $ProjectId

Write-Host "Building and deploying (Dockerfile) — first deploy may take several minutes..." -ForegroundColor Cyan
gcloud run deploy $Service `
    --source . `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --memory 2Gi `
    --cpu 2 `
    --timeout 900 `
    --max-instances 4 `
    --min-instances 0 `
    --set-env-vars "NODE_ENV=production,CORS_ORIGIN=*"

Write-Host "Done. Update frontend VITE_API_URL to the service URL shown above." -ForegroundColor Green
