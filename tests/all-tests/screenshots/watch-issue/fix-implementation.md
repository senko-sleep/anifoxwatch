# Implementation Summary: Fix for Watch Page Hanging with AniList IDs

## Issue Description
When navigating to URLs like:
- `http://localhost:8081/watch?id=anilist-1639&ep=2`
- `http://localhost:8081/watch?id=anilist-207141&ep=2`

The stream would hang and not play. Additionally, switching between episodes using the prev/next buttons wouldn't work.

## Root Cause Analysis
The problem was in `src/pages/Watch.tsx`:

1. The `useStreamingLinks` hook was only enabled when `selectedEpisodeForCurrentAnime` was truthy
2. `selectedEpisodeForCurrentAnime` was only set after episodes were loaded from the API
3. For AniList IDs, if the episode resolution failed (returned empty array), the episodes list would be empty
4. This meant `selectedEpisodeForCurrentAnime` would remain `null` indefinitely
5. The stream query would never run, causing the page to hang
6. Episode navigation also required episodes to be loaded, so it wouldn't work either

## Solution Implemented
Modified `src/pages/Watch.tsx` to:

1. **Read episode number from URL immediately** - Initialize `selectedEpisodeNum` from the URL's `ep` parameter
2. **Construct episode IDs for AniList** - Create episode IDs like `anilist-1639?ep=2` when episodes list is not available
3. **Enable streaming with constructed IDs** - Start the stream query as soon as we have a valid episode ID
4. **Support episode navigation without episodes list** - Allow prev/next to work for AniList IDs

## Code Changes

### File: `src/pages/Watch.tsx`

#### 1. Initialize episode number from URL (Lines 116-119)
```typescript
// Initialize episode number from URL or default to 1
const urlEpParam = searchParams.get('ep');
const initialEpisodeNum = urlEpParam ? parseInt(urlEpParam, 10) : 1;
const [selectedEpisodeNum, setSelectedEpisodeNum] = useState<number>(initialEpisodeNum);
```

#### 2. Add function to construct episode ID (Lines 190-206)
```typescript
// For AniList IDs, construct episode ID directly when episodes are not available yet
// This allows streaming to start immediately without waiting for episode list to load
const getEpisodeIdForStreaming = useCallback(() => {
  // If we have a selected episode for the current anime, use it
  if (selectedEpisodeForCurrentAnime) {
    return selectedEpisodeForCurrentAnime;
  }
  // For AniList IDs, construct the episode ID from the AniList ID and episode number
  if (cleanAnimeId.startsWith('anilist-') && selectedEpisodeNum > 0) {
    const constructedId = `${cleanAnimeId}?ep=${selectedEpisodeNum}`;
    console.log(`[Watch] Using constructed episode ID: ${constructedId}`);
    return constructedId;
  }
  // Fallback to empty string to disable streaming
  return '';
}, [cleanAnimeId, selectedEpisodeForCurrentAnime, selectedEpisodeNum]);

// Enable streaming if we have an episode ID (either from episodes or constructed)
const isStreamEnabled = useMemo(() => {
  const episodeId = getEpisodeIdForStreaming();
  const enabled = episodeId.length > 0;
  if (enabled && cleanAnimeId.startsWith('anilist-')) {
    console.log(`[Watch] Streaming enabled with episode ID: ${episodeId}`);
  }
  return enabled;
}, [getEpisodeIdForStreaming, cleanAnimeId]);
```

#### 3. Use constructed episode ID for streaming (Line 225-226)
```typescript
const {
  data: streamData,
  isLoading: streamLoading,
  error: streamError,
  refetch: refetchStream
} = useStreamingLinks(getEpisodeIdForStreaming(), streamServer, audioType, isStreamEnabled, selectedEpisodeNum,
    cleanAnimeId.startsWith('anilist-') ? parseInt(cleanAnimeId.replace('anilist-', ''), 10) || undefined : undefined, anime?.title, bypassCache);
```

#### 4. Update episode selection logic (Lines 564-594)
```typescript
const handleEpisodeSelect = useCallback((episodeId: string, episodeNum: number) => {
  // Prevent unnecessary re-renders if same episode
  // For AniList IDs with constructed episode IDs, compare the episode number
  if (cleanAnimeId.startsWith('anilist-')) {
    const currentEpNum = selectedEpisodeNum;
    const currentEpId = getEpisodeIdForStreaming();
    // If we're already on this episode, don't re-trigger
    if (episodeNum === currentEpNum && episodeId === currentEpId) return;
  } else if (episodeId === selectedEpisode) {
    return;
  }
  
  // ... rest of the function
}, [selectedEpisode, selectedEpisodeNum, cleanAnimeId, searchParams, setSearchParams, getEpisodeIdForStreaming]);
```

#### 5. Update prev/next handlers (Lines 610-634)
```typescript
const handlePrevEpisode = useCallback(() => {
  // For AniList IDs, we can navigate by episode number even without episodes list
  if (cleanAnimeId.startsWith('anilist-') && selectedEpisodeNum > 1) {
    // Construct a new episode ID for the previous episode
    const prevEpisodeId = `${cleanAnimeId}?ep=${selectedEpisodeNum - 1}`;
    handleEpisodeSelect(prevEpisodeId, selectedEpisodeNum - 1);
    return;
  }
  if (!episodes?.length) return;
  const currentIndex = episodes.findIndex(e => e.id === selectedEpisode);
  if (currentIndex > 0) {
    const prev = episodes[currentIndex - 1];
    handleEpisodeSelect(prev.id, prev.number);
  }
}, [episodes, selectedEpisode, selectedEpisodeNum, cleanAnimeId, handleEpisodeSelect]);

const handleNextEpisode = useCallback(() => {
  // For AniList IDs, we can navigate by episode number even without episodes list
  // We'll just increment the episode number (the backend will handle if it doesn't exist)
  if (cleanAnimeId.startsWith('anilist-')) {
    const nextEpisodeId = `${cleanAnimeId}?ep=${selectedEpisodeNum + 1}`;
    handleEpisodeSelect(nextEpisodeId, selectedEpisodeNum + 1);
    return;
  }
  if (!episodes?.length) return;
  const currentIndex = episodes.findIndex(e => e.id === selectedEpisode);
  if (currentIndex < episodes.length - 1) {
    const next = episodes[currentIndex + 1];
    handleEpisodeSelect(next.id, next.number);
  }
}, [episodes, selectedEpisode, selectedEpisodeNum, cleanAnimeId, handleEpisodeSelect]);
```

#### 6. Update hasPrev/hasNext (Line 641)
```typescript
// For AniList IDs, always allow navigation (backend will handle if episode doesn't exist)
// For other IDs, check if there are previous/next episodes in the list
const hasPrev = cleanAnimeId.startsWith('anilist-') ? selectedEpisodeNum > 1 : (episodes?.findIndex(e => e.id === selectedEpisode) ?? -1) > 0;
const hasNext = cleanAnimeId.startsWith('anilist-') ? true : episodes ? (episodes.findIndex(e => e.id === selectedEpisode) ?? 0) < episodes.length - 1 : false;
```

## Backend Compatibility
The fix works because the backend already supports AniList IDs with episode numbers:

1. **Streaming route** (`server/src/routes/streaming.ts:787-789`):
   - Receives episode IDs like `anilist-1639?ep=2`
   - Calls `reconstructEpisodeId()` which preserves the `?ep=2` parameter
   - Passes the full episode ID to `sourceManager.getStreamingLinks()`

2. **Source Manager** (`server/src/services/source-manager.ts:3249-3255`):
   - Detects AniList IDs (starts with 'anilist-')
   - Routes to Yomi source for resolution

3. **Yomi Source** (`server/src/sources/yomi-source.ts:172-176`):
   - Extracts anilistId from `anilist-1639?ep=2` using regex `/^anilist-(\d+)/i`
   - Extracts episodeNum from `?ep=2` using regex `/[?&]eps?=(\d+)/i`
   - Also accepts anilistId from `options?.anilistId` as fallback (commit 0c549f1)
   - Builds embed URLs: `https://vidnest.fun/animepahe/{anilistId}/{episodeNum}/{category}`

## Testing
The fix can be tested by:

1. Navigating directly to: `http://localhost:8081/watch?id=anilist-1639&ep=2`
2. Expected behavior:
   - Console shows: `[Watch] Using constructed episode ID: anilist-1639?ep=2`
   - Console shows: `[Watch] Streaming enabled with episode ID: anilist-1639?ep=2`
   - Stream starts loading immediately
   - Prev/Next buttons work (if episode 1, prev is disabled; next always enabled)

3. Clicking next episode button
4. Expected behavior:
   - URL updates to `?ep=3`
   - Console shows: `[Watch] Using constructed episode ID: anilist-1639?ep=3`
   - Stream reloads with episode 3

5. If episodes later load successfully:
   - `selectedEpisode` gets set to the actual episode ID from the list
   - Streaming continues using the actual episode ID

## Debugging
Added console logs to help track the flow:
- `[Watch] Using constructed episode ID: {id}` - When a constructed ID is being used
- `[Watch] Streaming enabled with episode ID: {id}` - When streaming is enabled for AniList IDs

These logs will appear in the browser console when the page loads.

## Benefits
1. **Faster initial load** - Streaming starts immediately for AniList IDs
2. **Better resilience** - Works even if episode resolution fails
3. **Better UX** - Episode navigation works without episodes list
4. **Graceful degradation** - Uses constructed IDs when needed, real IDs when available
5. **Backward compatible** - Non-AniList IDs work exactly as before

## Edge Cases Handled
1. **Episode resolution fails** - Falls back to constructed IDs
2. **Episodes load later** - Switches to real episode IDs when available
3. **Invalid episode numbers** - Backend returns 404, which is handled gracefully
4. **Switching anime** - Reset logic ensures clean state for new anime
5. **Direct navigation** - URL parameters are read immediately

## Files Modified
- `src/pages/Watch.tsx` - Main fix implementation

## Files Created (for documentation)
- `tests/watch-issue/test-fix.md` - Problem description and solution
- `tests/watch-issue/changes-summary.md` - Detailed change descriptions
- `tests/watch-issue/fix-implementation.md` - This file
