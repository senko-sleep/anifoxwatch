# 🚀 API Deployment Guide

This guide explains how to deploy and switch between different API backends for AniStream Hub.

## 📋 Available Deployments

### 1️⃣ Local Development (Express)
- **URL**: `http://localhost:3001`
- **Best for**: Development and testing
- **Features**: Full logging, hot reload, easy debugging

### 2️⃣ Cloudflare Workers
- **URL**: `https://anifoxwatch-api.anifoxwatch.workers.dev`
- **Best for**: Global edge deployment, low latency
- **Features**: Edge computing, automatic scaling, 0ms cold starts

### 3️⃣ Render.com (Legacy)
- **URL**: `https://anifoxwatch-api.anifoxwatch.workers.dev` (Replaced Render with Cloudflare Workers)
- **Status**: Replaced by Cloudflare Workers for better performance

---

## 🔧 Quick Setup

### Local Development

1. **Start the Express server**:
   ```bash
   cd server
   npm install
   npm run dev
   ```

2. **Start the frontend**:
   ```bash
   npm run dev
   ```

The frontend will automatically connect to `http://localhost:3001`.

---

### Cloudflare Workers Deployment

1. **Install Wrangler CLI** (if not already installed):
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Deploy the worker**:
   ```bash
   cd server
   npm run deploy:cloudflare
   ```

4. **Copy the Worker URL** from the deployment output (e.g., `https://anifoxwatch-api.your-subdomain.workers.dev`)

5. **Update your environment**:
   
   For production (`.env.production`):
   ```env
   VITE_API_URL=https://anifoxwatch-api.your-subdomain.workers.dev
   ```
   
   Or in `src/lib/api-config.ts`, update:
   ```typescript
   cloudflare: 'https://anifoxwatch-api.your-subdomain.workers.dev'
   ```

6. **Build and deploy frontend**:
   ```bash
   npm run build
   npm run deploy:frontend
   ```

---

### Render.com Deployment

1. **Create a new Web Service** on [Render.com](https://render.com)

2. **Connect your GitHub repository**

3. **Configure the service**:
   - **Root Directory**: `server`
   - **Build Command**: `npm install ; npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node

4. **The API will be deployed** at `https://your-service.onrender.com`

5. **Update `.env.production`**:
   ```env
   VITE_API_URL=https://your-service.onrender.com
   ```

---

## 🔄 Switching API Deployments

### Method 1: Environment Variables (Recommended)

Update `.env.production` or `.env.development`:

```env
VITE_API_URL=https://anifoxwatch-api.anifoxwatch.workers.dev

# Or use local
VITE_API_URL=http://localhost:3001
```

### Method 2: Runtime Switching

Use the `api-config.ts` utilities:

```typescript
import { setApiDeployment } from '@/lib/api-config';

// Switch to Cloudflare Workers
const newBaseUrl = setApiDeployment('cloudflare');

// Or use a custom URL
const customUrl = setApiDeployment('https://my-custom-api.com');
```

### Method 3: Auto-Detection (Default)

The app automatically detects the environment:
- **Development** (`npm run dev`): Uses `http://localhost:3001`
- **Production** (`npm run build`): Uses the URL from `.env.production`

---

## 🧪 Testing All Deployments

Check the status of all API deployments:

```typescript
import { testAllDeployments } from '@/lib/api-config';

const statuses = await testAllDeployments();

console.log('Local:', statuses.local);
console.log('Cloudflare:', statuses.cloudflare);
console.log('Render:', statuses.render);
```

Example output:
```json
{
  "local": {
    "online": true,
    "deployment": "development",
    "latency": 15,
    "version": "1.0.0"
  },
  "cloudflare": {
    "online": true,
    "deployment": "cloudflare-workers",
    "latency": 45,
    "version": "1.0.0-worker"
  },
  "render": {
    "online": true,
    "deployment": "production",
    "latency": 120,
    "version": "1.0.0"
  }
}
```

---

## 📊 Endpoint Coverage

All deployments support **100% of endpoints**:

✅ **Anime Endpoints** (20+)
- Search, Browse, Filter, Trending, Latest
- Genre search, Seasonal, Leaderboard, Schedule
- Random, Top-rated, Types, Genres, Statuses
- Years, Seasons, Details, Episodes

✅ **Streaming Endpoints** (3)
- Get servers, Watch episode, Proxy streams

✅ **Source Management** (4)
- List sources, Health check, Set preferred

---

## 🎯 Recommendations

| Use Case | Recommended Deployment |
|----------|------------------------|
| Development | Local Express |
| Global Users | Cloudflare Workers |
| Simple Hosting | Render.com |
| Cost Optimization | Cloudflare Workers (free tier) |
| Best Performance | Cloudflare Workers (edge) |

---

## 🐛 Troubleshooting

### Frontend can't connect to API

1. **Check CORS**: Ensure the API has CORS enabled for your frontend domain
2. **Verify URL**: Check `.env.production` has the correct API URL
3. **Test directly**: Visit `https://your-api-url/health` in browser
4. **Check console**: Look for CORS or network errors in browser DevTools

### Cloudflare Worker issues

1. **Check deployment**: Run `cd server ; wrangler tail` to see live logs
2. **Verify routes**: All routes should start with `/api/`
3. **Check limits**: Free tier has 100k requests/day limit

### Render.com issues

1. **Check logs**: View logs in Render dashboard
2. **Verify build**: Ensure `npm run build` completes successfully
3. **Check health**: Visit `/health` endpoint to test

---

## 🔐 Security Notes

- Never commit `.env` files with real API URLs to Git
- Use environment variables for sensitive configuration
- Enable Cloudflare firewall rules for additional protection
- Monitor API usage to detect abuse

---

## 📝 NPM Scripts Reference

```bash
# Development
npm run dev              # Start local Express + Vite
npm run dev:client       # Start Vite only
npm run dev:api          # Start Express only
npm run dev:cloudflare   # Test Cloudflare Worker locally

# Production
npm run build            # Build frontend for production
npm run deploy:frontend  # Deploy to Firebase hosting
npm run deploy:api       # Deploy to Render (via Git push)
npm run deploy:cloudflare # Deploy to Cloudflare Workers
```

---

Need help? Check the [main README](./README.md) or open an issue!
