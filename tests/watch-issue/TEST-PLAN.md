# Test Plan for Watch Page Fix

## Status: Fix Applied, Tests Not Yet Run

I have **NOT** run the actual tests yet because:
- I'm in a CLI-only environment without Node.js execution capabilities
- The server must be running for backend tests to work
- Browser tests require a running server + Chromium

## What I Have Done ✅

1. **Code Analysis**: Traced the entire flow from frontend to backend
2. **Root Cause Identification**: Stream query was disabled when episodes couldn't load
3. **Fix Implementation**: Modified `src/pages/Watch.tsx` with 8 key changes
4. **Syntax Verification**: Manually verified the TypeScript changes are correct
5. **Documentation**: Created comprehensive docs in this folder

## What You Need to Do 🎯

### Step 1: Run Backend Test
```bash
cd C:\Users\Owner\anistream-hub
node tests/scripts/test-backend-resolve.mjs
```

**What to Look For:**
```
[1639 Stream] (XXXms): { sources: [...], source: 'Yomi', category: 'sub' }
[207141 Stream] (XXXms): { sources: [...], source: 'Yomi', category: 'sub' }
```

**If You See Errors:**
- `Error: No sources found` → Yomi sources (vidnest.fun, tryembed.us.cc) are down/blocked
- `Error: sourceManager not initialized` → Server not properly started
- Timeout errors → Backend is too slow (increase timeouts)

### Step 2: Check Backend Debug Endpoint
Open in browser: `http://localhost:8081/api/stream/debug`

**Expected Output:**
```json
{
  "status": "ok",
  "registeredSources": ["Yomi", "Aniwaves", "WatchHentai"],
  "sourceManagerSources": ["Yomi", "Aniwaves", "WatchHentai"],
  "sourcesAvailable": 3
}
```

**If sourcesAvailable is 0:**
- Server not initialized properly
- Check server logs for source registration errors

### Step 3: Run Browser Diagnosis Test
```bash
node tests/scripts/diagnose-watch.mjs
```

**What to Look For:**
```
[BROWSER CONSOLE LOG] [Watch] Using constructed episode ID: anilist-1639?ep=2
[BROWSER CONSOLE LOG] [Watch] Streaming enabled with episode ID: anilist-1639?ep=2
[BROWSER CONSOLE LOG] [useStreamingLinks] Fetching stream: {episodeId: "anilist-1639?ep=2", ...}
[API RESPONSE 200] http://localhost:8081/api/stream/watch/anilist-1639?ep=2
```

**If You See FAILED REQUESTS:**
- `404 /api/stream/watch/anilist-1639?ep=2` → Backend route not working
- `500 /api/stream/watch/anilist-1639?ep=2` → Server error (check server logs)
- Network errors → Server not running or CORS issues

### Step 4: Manual Browser Test
1. Open: `http://localhost:8081/watch?id=anilist-1639&ep=2`
2. Open DevTools (F12)
3. Check Console tab
4. Wait 10 seconds

**Expected:**
- Loading spinner appears immediately
- Console shows constructed episode ID messages
- Stream starts playing OR shows clear error message

**If Hanging:**
- Console shows no messages → Frontend code not loading (check build)
- Console shows errors → See specific error below

## Expected Test Results After Fix

### ✅ Success Scenario
```
[1639 Anime] (2000ms): Cowboy Bebop
[1639 Episodes] (3000ms): count = 26
[1639 Stream] (5000ms): { sources: [{url: 'https://...m3u8', ...}], source: 'Yomi' }

[207141 Anime] (2000ms): Some Anime
[207141 Episodes] (3000ms): count = 12
[207141 Stream] (5000ms): { sources: [{url: 'https://...m3u8', ...}], source: 'Yomi' }

[BROWSER CONSOLE LOG] [Watch] Using constructed episode ID: anilist-1639?ep=2
[BROWSER CONSOLE LOG] [Watch] Streaming enabled with episode ID: anilist-1639?ep=2
```

### ❌ Failure Scenarios and Fixes

#### Scenario 1: Backend returns no sources
```
[1639 Stream] (10000ms): { sources: [], subtitles: [] }
```
**Cause:** Yomi's sources (vidnest.fun, tryembed.us.cc) are down or blocked
**Fix Options:**
- Check if these domains are accessible from your network
- Try with VPN
- Add more fallback sources for AniList IDs (Aniwaves, etc.)

#### Scenario 2: Backend timeout
```
[1639 Stream Error]: Request timeout
```
**Cause:** Backend taking too long to respond
**Fix Options:**
- Increase timeouts in source-manager.ts
- Check server performance
- Reduce number of sources being tried

#### Scenario 3: sourceManager not initialized
```
[STREAM] sourceManager is not initialized!
```
**Cause:** Server not properly started
**Fix:**
- Ensure server is running: `npm run dev:api`
- Check server startup logs
- Wait for "sourceManager has X sources registered" message

#### Scenario 4: Frontend console shows no messages
```
(no [Watch] messages)
```
**Cause:** Frontend code not loading
**Fix:**
- Rebuild frontend: `npm run build`
- Clear browser cache
- Check if build has errors

## Next Steps

1. **Run the backend test first** - This tells us if the server can resolve streams
2. **If backend works** → Run browser test to check frontend
3. **If backend fails** → Fix server-side issues first
4. **If both work but still hanging** → There's another issue we need to debug

## Contact Me With Results

After running the tests, share:
1. Output from `test-backend-resolve.mjs`
2. Output from `diagnose-watch.mjs`
3. Any errors in browser console
4. Any errors in server console

I'll help you analyze the results and fix any remaining issues.
