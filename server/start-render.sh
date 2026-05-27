#!/bin/bash
# Render.com Memory-Optimized Startup Script
# This script is used by render.json to start the app with memory optimizations

set -e

echo "🚀 Starting AniStream Hub API with memory optimizations..."
echo "📊 Memory limit: 256MB (Render free tier: 512MB total)"
echo "🧠 Garbage collection: Enabled"

# Set environment variables for Node.js memory management
export NODE_ENV=production
export NODE_OPTIONS="--max-old-space-size=256 --expose-gc --disable-warnings"
export ENABLE_MIRO_PUPPETEER=0

# Log memory info
echo ""
echo "📈 System Information:"
free -h || true
echo ""

# Start the application
cd server
npm run start:render
