# Watch Page Fix for AniList IDs - Complete Documentation

## Problem Statement

When navigating to watch URLs with AniList IDs:
- `http://localhost:8081/watch?id=anilist-1639&ep=2`
- `http://localhost:8081/watch?id=anilist-207141&ep=2`

The page would hang indefinitely with the loading spinner, and switching episodes wouldn't work.

## Root Cause

The frontend was waiting for episodes to be fetched from the backend before enabling the stream query. For AniList IDs, if episode resolution failed (which could happen due to various reasons), the episodes array would be empty, preventing the stream query from ever running.

## Solution

Modified `src/pages/Watch.tsx` to:
1. Immediately read episode number from URL parameter
2. Construct episode IDs for AniList on-the-fly when episodes aren't available
3. Enable streaming as soon as we have a valid episode ID (constructed or real)
4. Support episode navigation without episodes list

## Files Modified

- `src/pages/Watch.tsx` - Main implementation

## Files Created (Documentation)

This folder contains:
- `README.md` - This overview
- `test-fix.md` - Problem description and solution
- `changes-summary.md` - Detailed code changes
- `fix-implementation.md` - Complete implementation documentation
- `verify-fix.md` - Verification and testing guide

## Quick Fix Summary

### Before
```typescript
const { data: streamData, ... } = useStreamingLinks(
  selectedEpisodeForCurrentAnime || '',  // Empty string when episodes not loaded
  streamServer,
  audioType,
  !!selectedEpisodeForCurrentAnime,      // false when episodes not loaded
  ...
);
```

### After
```typescript
const getEpisodeIdForStreaming = useCallback(() => {
  if (selectedEpisodeForCurrentAnime) return selectedEpisodeForCurrentAnime;
  if (cleanAnimeId.startsWith('anilist-') && selectedEpisodeNum > 0) {
    return `${cleanAnimeId}?ep=${selectedEpisodeNum}`;  // Constructed ID
  }
  return '';
}, [cleanAnimeId, selectedEpisodeForCurrentAnime, selectedEpisodeNum]);

const isStreamEnabled = useMemo(() => getEpisodeIdForStreaming().length > 0, [getEpisodeIdForStreaming]);

const { data: streamData, ... } = useStreamingLinks(
  getEpisodeIdForStreaming(),  // Uses constructed ID
  streamServer,
  audioType,
  isStreamEnabled,             // true when we have an ID
  ...
);
```

## Backend Support

The backend already supports this via:
- **Yomi source**: Extracts anilistId and episodeNum from `anilist-1639?ep=2`
- **Cross-source fallback**: Title-based search when direct resolution fails
- **Streaming route**: Handles `?ep=N` query parameters

## Testing

Run the provided test script to capture console errors:
```bash
node tests/scripts/capture-watch-errors.mjs
```

Or manually test using the guide in `verify-fix.md`

## Expected Console Output

With the fix, you should see:

```
[Watch] Using constructed episode ID: anilist-1639?ep=2
[Watch] Streaming enabled with episode ID: anilist-1639?ep=2
[useStreamingLinks] Fetching stream: {episodeId: "anilist-1639?ep=2", ...}
[API] Fetching stream for episode: anilist-1639?ep=2
[STREAM] sourceManager has 3 sources registered
[STREAM] Calling sourceManager.getStreamingLinks with: {episodeId: "anilist-1639?ep=2", ...}
[Yomi] Resolving anilist-1639 ep2 (sub) via HTTP extract
```

## Benefits

1. ✅ **Faster initial load** - Streaming starts immediately
2. ✅ **Better resilience** - Works even if episode resolution fails
3. ✅ **Better UX** - Episode navigation works without episodes list
4. ✅ **Graceful degradation** - Falls back to constructed IDs when needed
5. ✅ **Backward compatible** - Non-AniList IDs work exactly as before

## Known Limitations

- For AniList IDs, relies on Yomi source (vidnest.fun, tryembed.us.cc)
- If these domains are blocked/ISP-blocked, stream may fail
- Cross-source fallback can help but may be slower

## Next Steps

1. Apply the fix to `src/pages/Watch.tsx`
2. Test using the verification guide
3. If issues persist, check console and server logs
4. Consider adding more fallback sources for AniList IDs
