# Verification Guide for Watch Page Fix

## Quick Test

After applying the fix to `src/pages/Watch.tsx`, test the following:

### Test 1: Direct Navigation to AniList ID URL

1. Open browser dev tools (F12)
2. Navigate to: `http://localhost:8081/watch?id=anilist-1639&ep=2`
3. Check console for logs:
   - `[Watch] Using constructed episode ID: anilist-1639?ep=2`
   - `[Watch] Streaming enabled with episode ID: anilist-1639?ep=2`
   - `[useStreamingLinks] Fetching stream: {episodeId: "anilist-1639?ep=2", ...}`

**Expected Result:**
- Stream should start loading immediately (spinner appears)
- No "hanging" or frozen state
- After 8 seconds, "Server warming up" message may appear
- Stream should eventually load or show an error message

### Test 2: Switching Episodes

1. Once stream is loaded (or failed), click "Next Episode" button
2. Check console for logs:
   - URL should update to `?ep=3`
   - `[Watch] Using constructed episode ID: anilist-1639?ep=3`
   - `[useStreamingLinks] Fetching stream: {episodeId: "anilist-1639?ep=3", ...}`

**Expected Result:**
- Stream should switch to episode 3
- No errors or hanging

### Test 3: Prev Button

1. After going to episode 3, click "Prev Episode" button
2. Check URL updates to `?ep=2`
3. Stream should switch back to episode 2

**Expected Result:**
- Smooth transition back to episode 2

## Common Issues and Solutions

### Issue: Still hanging on loading screen

**Possible Causes:**
1. Backend server not running
2. Backend request timing out
3. CORS issues with vidnest.fun/tryembed.us.cc
4. Network connectivity issues

**Debugging:**
1. Check browser console for errors
2. Check Network tab for failed requests
3. Look for `500` or `404` responses from `/api/stream/watch/anilist-1639`

### Issue: Stream error after timeout

**Expected Behavior:**
- After ~10 seconds, if no sources are found, should show error message
- Error should be visible in the UI

**Debugging:**
1. Check console for error messages
2. Look for `[API] ❌ Stream fetch failed:` in console
3. Check if Yomi source is returning empty results

### Issue: Prev/Next buttons not working

**Possible Causes:**
1. `hasPrev` or `hasNext` logic incorrect
2. `handleEpisodeSelect` not being called

**Debugging:**
1. Add console.log in `handlePrevEpisode` and `handleNextEpisode`
2. Check if buttons are clickable (not disabled)
3. Verify `hasPrev` and `hasNext` values

## Backend Logs to Check

If you have access to the server logs, look for:

1. **Stream request received:**
   ```
   [STREAM] Fetching stream for episode: anilist-1639?ep=2
   ```

2. **Source manager processing:**
   ```
   [STREAM] sourceManager has X sources registered
   [STREAM] Calling sourceManager.getStreamingLinks with: {episodeId: "anilist-1639?ep=2", ...}
   [STREAM] getStreamingLinks returned: {hasSources: true/false, sourcesCount: N}
   ```

3. **Yomi source processing:**
   ```
   [Yomi] Resolving anilist-1639 ep2 (sub) via HTTP extract
   [Yomi] ✅ anilist-1639 ep2: https://...m3u8...
   ```

4. **Errors:**
   ```
   [STREAM] No sources found for anilist-1639?ep=2
   ```

## Success Criteria

✅ Stream starts loading within 2-3 seconds of page load
✅ Console shows constructed episode ID being used
✅ Console shows streaming is enabled
✅ No "hanging" or frozen state
✅ Prev/Next buttons work and switch episodes
✅ Stream plays or shows clear error message

## If Still Not Working

1. Check if vidnest.fun and tryembed.us.cc are accessible from your network
2. Try with a VPN to see if ISP is blocking these domains
3. Check if the backend server is properly initialized with sources
4. Verify that sourceManager has sources registered (check `/api/stream/debug`)
