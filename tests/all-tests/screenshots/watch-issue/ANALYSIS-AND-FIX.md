# Complete Analysis and Fix for Watch Page Issue

## Executive Summary

**Status**: Fix implemented, not yet tested due to environment limitations
**Issue**: Stream hanging when using AniList IDs (anilist-1639, anilist-207141)
**Root Cause**: Stream query was disabled waiting for episodes to load
**Fix**: Enable stream query immediately with constructed episode IDs

---

## Analysis of Existing Test Results

### From `console-capture-all.json`

**Key Finding**: Requests to `/api/stream/watch` are **MISSING** from the capture

**What We See** (for both anilist-1639 and anilist-207141):
```
[RequestFailed] net::ERR_ABORTED - /api/anime?id=anilist-1639
[RequestFailed] net::ERR_ABORTED - /api/anime/episodes?id=anilist-1639
[RequestFailed] net::ERR_ABORTED - /api/anime/resolve?id=anilist-1639
```

**What We DON'T See**:
- Any requests to `/api/stream/watch/anilist-1639?ep=2`
- Any console logs from `useStreamingLinks`

### Root Cause Analysis

The stream query (`useStreamingLinks`) was **never being executed** because:

1. **Before Fix**: `enabled: !!selectedEpisodeForCurrentAnime`
2. `selectedEpisodeForCurrentAnime` = `selectedAnimeId === cleanAnimeId ? selectedEpisode : null`
3. Initially: `selectedAnimeId` = `cleanAnimeId` = `anilist-1639`, but `selectedEpisode` = `null`
4. So: `selectedEpisodeForCurrentAnime` = `null`
5. Therefore: `enabled` = `false`
6. **Result**: Stream query never runs, no request to `/api/stream/watch`

### Why Episodes Queries Are Aborting

The `ERR_ABORTED` errors for anime/episodes queries are likely due to:
- React Query aborting duplicate/racing requests
- Or component re-renders causing query re-fetch
- But this is **secondary** - even if these fail, the stream should still work with our fix

---

## Fix Implementation

### Modified File: `src/pages/Watch.tsx`

### Key Changes:

1. **Immediate Episode Number**: Read `ep` from URL on mount
2. **Construct Episode IDs**: Create `anilist-1639?ep=2` when episodes not available
3. **Enable Streaming Early**: Start stream query as soon as we have any episode ID
4. **Navigation Without Episodes**: Prev/Next buttons work for AniList IDs without episodes list

### Code Flow After Fix:

```
User navigates to: /watch?id=anilist-1639&ep=2
    ↓
cleanAnimeId = "anilist-1639"
selectedEpisodeNum = 2 (from URL)
selectedEpisodeForCurrentAnime = null (initially)
    ↓
getEpisodeIdForStreaming() = "anilist-1639?ep=2" ✅
isStreamEnabled = true ✅
    ↓
useStreamingLinks() ENABLED ✅
    ↓
Request sent to: /api/stream/watch/anilist-1639?ep=2
    ↓
Yomi source extracts: anilistId=1639, episodeNum=2
    ↓
Yomi tries: vidnest.fun/animepahe/1639/2/sub
         tryembed.us.cc/embed/anime/1639/2/sub
    ↓
Returns: M3U8 URL (or error)
    ↓
Stream plays OR shows error message
```

---

## Expected Test Results After Fix

### Backend Test (`test-backend-resolve.mjs`)

**Should Output:**
```
Testing anilist-1639...
[1639 Anime] (2000ms): {title: "Cowboy Bebop", ...}
[1639 Episodes] (3000ms): {length: 26, ...}
[1639 Stream] (5000ms): {sources: [{url: "https://...m3u8", ...}], source: "Yomi"}

Testing anilist-207141...
[207141 Anime] (2000ms): {title: "Some Anime", ...}
[207141 Episodes] (3000ms): {length: 12, ...}
[207141 Stream] (5000ms): {sources: [...], source: "Yomi"}
```

**If You See:**
- `[1639 Stream] (10000ms): { sources: [], subtitles: [] }`
  - **Meaning**: Yomi couldn't find sources (vidnest.fun/tryembed.us.cc down)
  - **Action**: Check if these domains are accessible, try with VPN

### Browser Test (`diagnose-watch.mjs`)

**Should Output:**
```
[BROWSER CONSOLE LOG] [Watch] Using constructed episode ID: anilist-1639?ep=2
[BROWSER CONSOLE LOG] [Watch] Streaming enabled with episode ID: anilist-1639?ep=2
[BROWSER CONSOLE LOG] [useStreamingLinks] Fetching stream: {episodeId: "anilist-1639?ep=2", ...}
[API RESPONSE 200] http://localhost:8081/api/stream/watch/anilist-1639?ep=2
```

**Key Difference from Before:**
- ✅ Request to `/api/stream/watch` **NOW APPEARS**
- ✅ Console shows constructed episode ID
- ✅ Console shows streaming is enabled

### Manual Test

1. Open: `http://localhost:8081/watch?id=anilist-1639&ep=2`
2. Check Console (F12)
3. **Should See Within 2 Seconds:**
   - `[Watch] Using constructed episode ID: anilist-1639?ep=2`
   - `[Watch] Streaming enabled with episode ID: anilist-1639?ep=2`
   - Loading spinner appears
4. **Within 10 Seconds:**
   - Stream starts playing OR shows error message
   - No hanging/indeterminate loading

---

## If Tests Still Fail

### Scenario 1: Backend Returns No Sources

**Symptoms:**
- `[1639 Stream] (10000ms): { sources: [], subtitles: [] }`
- No console errors, just empty results

**Root Cause:** Yomi's sources (vidnest.fun, tryembed.us.cc) are down/blocked

**Solutions:**
1. **Quick Test**: Can you access these URLs in your browser?
   - `https://vidnest.fun/animepahe/1639/2/sub`
   - `https://tryembed.us.cc/embed/anime/1639/2/sub`
2. **Try VPN**: Your ISP might be blocking these domains
3. **Add More Sources**: Modify source-manager to try other sources for AniList IDs

### Scenario 2: Backend Timeout

**Symptoms:**
- `[1639 Stream Error]: Request timeout after 10000ms`

**Root Cause:** Backend taking too long to respond

**Solutions:**
1. Increase timeouts in `server/src/services/source-manager.ts`
2. Check server performance/load
3. Reduce number of sources being tried

### Scenario 3: sourceManager Not Initialized

**Symptoms:**
- `[STREAM] sourceManager is not initialized!`

**Root Cause:** Server not properly started

**Solutions:**
1. Ensure server is running: `npm run dev:api`
2. Wait for log: `Registered 3 sources`
3. Check `/api/stream/debug` endpoint

### Scenario 4: Frontend Still Not Making Request

**Symptoms:**
- No `[Watch] Using constructed episode ID` in console
- No request to `/api/stream/watch`

**Root Cause:** Fix not applied correctly

**Solutions:**
1. Verify `src/pages/Watch.tsx` has the changes
2. Rebuild frontend: `npm run build`
3. Clear browser cache
4. Check for TypeScript errors

---

## Next Steps for You

1. **Apply the fix** (already done in `src/pages/Watch.tsx`)
2. **Start the server**: `npm run dev:api`
3. **Start the frontend**: `npm run dev:client`
4. **Run backend test**: `node tests/scripts/test-backend-resolve.mjs`
5. **Share results** with me

I will analyze any errors and help fix them.

---

## Success Criteria

| Test | Before Fix | After Fix |
|------|------------|-----------|
| Backend returns stream | ❌ No | ✅ Yes |
| `/api/stream/watch` request | ❌ Missing | ✅ Present |
| Console shows constructed ID | ❌ No | ✅ Yes |
| Stream starts within 10s | ❌ Hangs | ✅ Works |
| Prev/Next buttons work | ❌ No | ✅ Yes |
| Error messages visible | ❌ No | ✅ Yes |

---

## Summary

**The fix is complete and should resolve the hanging issue.**

The root cause was that the stream query was disabled waiting for episodes to load. With my fix, it now:
1. Constructs episode IDs immediately from the URL
2. Enables streaming right away
3. Works independently of the episodes list

**Everything is organized in `tests/watch-issue/`** with detailed documentation.

**Please run the tests and share the results so we can verify the fix works!**
