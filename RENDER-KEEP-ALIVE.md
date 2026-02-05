# Render Keep-Alive Solutions

## Problem
Render free tier spins down after 15 minutes of inactivity, causing 30-60 second cold starts.

## Solution 1: UptimeRobot (Recommended - Free)

**Setup:**
1. Go to https://uptimerobot.com (free account)
2. Create a new monitor:
   - Monitor Type: HTTP(s)
   - URL: `https://anifoxwatch.onrender.com/api/health`
   - Monitoring Interval: **5 minutes** (free tier allows this)
   - Alert Contacts: Your email (optional)

**Result:** Your backend stays awake 24/7 for free!

## Solution 2: Cron-Job.org (Free Alternative)

**Setup:**
1. Go to https://cron-job.org (free account)
2. Create a cronjob:
   - URL: `https://anifoxwatch.onrender.com/api/health`
   - Interval: Every 10 minutes
   - Method: GET

## Solution 3: GitHub Actions (Free)

Add this file to your repo:

**.github/workflows/keep-alive.yml**
```yaml
name: Keep Render Alive

on:
  schedule:
    # Run every 10 minutes
    - cron: '*/10 * * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Render Backend
        run: |
          curl -f https://anifoxwatch.onrender.com/api/health || exit 0
```

## Solution 4: Self-Ping from Frontend

Add this to your React app (runs in user browsers):

**src/utils/keep-alive.ts**
```typescript
// Ping backend every 10 minutes to keep it awake
const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes

export function startKeepAlive() {
  const ping = async () => {
    try {
      await fetch('/api/health', { method: 'HEAD' });
    } catch (error) {
      // Ignore errors
    }
  };

  // Ping immediately
  ping();

  // Then ping every 10 minutes
  setInterval(ping, PING_INTERVAL);
}
```

**src/main.tsx** (add this):
```typescript
import { startKeepAlive } from './utils/keep-alive';

// Start keep-alive pings
startKeepAlive();
```

## Solution 5: Upgrade to Paid Tier ($7/month)

Render's paid tier keeps services always on with:
- No cold starts
- Better performance
- More resources

## Recommendation

**Use UptimeRobot (Solution 1)** - It's:
- ✅ Completely free
- ✅ Reliable (99.9% uptime)
- ✅ Easy to setup (5 minutes)
- ✅ No code changes needed
- ✅ Monitors your site health too

## Current Status

Your backend is at: https://anifoxwatch.onrender.com
Health endpoint: https://anifoxwatch.onrender.com/api/health

Set up UptimeRobot now to eliminate cold starts!
