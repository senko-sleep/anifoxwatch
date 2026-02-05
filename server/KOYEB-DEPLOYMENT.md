# Koyeb Deployment Guide

## Prerequisites
- Docker installed locally (for testing)
- Koyeb account
- GitHub repository with this code

## Quick Deploy to Koyeb

### Option 1: Deploy via GitHub (Recommended)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Prepare for Koyeb deployment"
   git push origin main
   ```

2. **Create Koyeb Service**
   - Go to [Koyeb Console](https://app.koyeb.com)
   - Click "Create Service"
   - Select "GitHub"
   - Choose your repository
   - Set the **Build** settings:
     - Builder: Docker
     - Dockerfile path: `server/Dockerfile`
     - Build context: `server`

3. **Configure Environment Variables**
   In Koyeb service settings, add these environment variables:
   
   | Variable | Value | Description |
   |----------|-------|-------------|
   | `NODE_ENV` | `production` | Production mode |
   | `PORT` | `8000` | Koyeb default port |
   | `CORS_ORIGIN` | `*` or your frontend URL | CORS settings |
   | `STREAMING_API_URL` | *(set after deploy)* | Your streaming API URL |

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete (~3-5 minutes)

### Option 2: Deploy via Docker Image

1. **Build Docker Image**
   ```bash
   cd server
   docker build -t anistream-api .
   ```

2. **Test Locally**
   ```bash
   docker run -p 8000:8000 -e PORT=8000 anistream-api
   ```

3. **Push to Container Registry**
   ```bash
   # Tag for your registry
   docker tag anistream-api your-registry/anistream-api:latest
   docker push your-registry/anistream-api:latest
   ```

4. **Deploy on Koyeb**
   - Create service from Docker image
   - Set the image URL
   - Configure environment variables

## Environment Variables

### Required
- `PORT` - Server port (Koyeb sets this automatically to 8000)
- `NODE_ENV` - Set to `production`

### Optional
- `CORS_ORIGIN` - Allowed origins for CORS (default: `*`)
- `BASE_URL` - Your Koyeb app URL (e.g., `https://your-app-xxx.koyeb.app`)
- `STREAMING_API_URL` - URL for streaming API (for scraping)

## After Deployment

Once your service is deployed, Koyeb will provide you with a URL like:
```
https://your-app-xxx.koyeb.app
```

### Test the API
```bash
# Health check
curl https://your-app-xxx.koyeb.app/health

# API info
curl https://your-app-xxx.koyeb.app/api

# Search anime
curl "https://your-app-xxx.koyeb.app/api/anime/search?q=naruto"
```

## Setting the Streaming URL

After deployment, you'll receive your Koyeb URL. Update the `STREAMING_API_URL` environment variable in Koyeb:

1. Go to your Koyeb service settings
2. Navigate to "Environment Variables"
3. Add/Update: `STREAMING_API_URL=https://your-app-xxx.koyeb.app`
4. Redeploy the service

This allows the scraper to work exactly like localhost.

## Troubleshooting

### Build Fails
- Check Dockerfile syntax
- Ensure all dependencies are in package.json
- Check build logs in Koyeb console

### Puppeteer/Chrome Issues
The Dockerfile includes Chromium and required fonts. If you see Chrome-related errors:
- Verify `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` is set
- Check if the container has enough memory (recommend 512MB+)

### CORS Errors
- Set `CORS_ORIGIN` to your frontend domain
- Or use `*` for development

### Slow Cold Starts
Koyeb may have cold starts. To minimize:
- Use the "Always On" option (paid)
- Implement health check pings

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api` | API documentation |
| `GET /api/anime/search?q={query}` | Search anime |
| `GET /api/anime/trending` | Trending anime |
| `GET /api/anime/:id` | Anime details |
| `GET /api/stream/watch/:episodeId` | Get streaming URLs |
| `GET /api/stream/proxy?url={url}` | Proxy HLS streams |

## Resource Recommendations

For Koyeb:
- **Instance Type**: nano or micro (for testing), small+ for production
- **Memory**: 512MB minimum (Puppeteer needs memory)
- **Scaling**: Start with 1 instance, scale as needed
