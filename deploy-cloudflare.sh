#!/bin/bash

# Cloudflare Workers Setup Script
# Deploys AniStream Hub API to Cloudflare Workers

set -e

echo "🚀 AniStream Hub - Cloudflare Workers Deployment"
echo "=================================================="
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -g wrangler
fi

# Navigate to server directory
cd server

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Verify Cloudflare login
echo "🔐 Checking Cloudflare authentication..."
wrangler whoami || (echo "❌ Not authenticated. Running: wrangler login"; wrangler login)

# Build worker
echo "🔨 Building worker..."
npm run build:cloudflare

# Deploy
echo "🚀 Deploying to Cloudflare Workers..."
npm run deploy:cloudflare

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Get your worker URL from the deployment output above (anifoxwatch-api.<account>.workers.dev)"
echo "2. Set environment variables in Cloudflare dashboard:"
echo "   - HIANIME_REST_URL"
echo "   - STREAMING_TIMEOUT"
echo "   - NODE_ENV (production)"
echo "3. Update frontend VITE_API_URL to your worker URL"
echo "4. Test: curl https://anifoxwatch-api.<account>.workers.dev/health"
echo ""
