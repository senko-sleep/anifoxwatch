# Fix for Watch Page Hanging Issue with AniList IDs

## Problem
When navigating to URLs like:
- `http://localhost:8081/watch?id=anilist-1639&ep=2`
- `http://localhost:8081/watch?id=anilist-207141&ep=2`

The stream would hang and not play, and switching episodes wouldn't work.

## Root Cause
The issue was that:
1. For AniList IDs, the `useEpisodes` hook would try to resolve the AniList ID to a streaming ID and fetch episodes
2. If the resolution failed or returned no episodes (empty array), the `selectedEpisode` state would never be set
3. The `useStreamingLinks` hook was only enabled when `selectedEpisodeForCurrentAnime` was truthy
4. Since `selectedEpisodeForCurrentAnime` was `null` (because `selectedEpisode` was never set), the stream query was disabled and never ran

## Solution
The fix adds logic to construct the episode ID directly from the AniList ID and episode number when episodes are not available:

### Changes Made in `src/pages/Watch.tsx`:

1. **Initialize episode number from URL**: Read the `ep` parameter from the URL to set the initial episode number.

2. **Construct episode ID for streaming**: Added `getEpisodeIdForStreaming()` function that:
   - Returns the actual episode ID from the episodes list if available
   - For AniList IDs without episodes loaded, constructs the episode ID as `anilist-{id}?ep={episodeNum}`
   - This allows the stream to start immediately without waiting for episodes to load

3. **Enable streaming when we have an episode ID**: Changed the `enabled` parameter for `useStreamingLinks` to check if we have a valid episode ID (either from episodes or constructed)

4. **Support episode navigation without episodes list**: For AniList IDs:
   - `handlePrevEpisode` and `handleNextEpisode` now work even without the episodes list
   - They simply decrement/increment the episode number and construct the episode ID
   - `hasPrev` and `hasNext` always return true for AniList IDs (backend will handle invalid episodes)

## Testing
The fix allows:
1. Direct navigation to AniList ID URLs to start streaming immediately
2. Switching between episodes using prev/next buttons even without episodes list
3. Proper fallback to constructed episode IDs when episodes can't be resolved

## Backend Support
The backend already supports this through:
- Yomi source can extract anilistId and episodeNum from IDs like `anilist-1639?ep=2`
- The streaming route passes the anilistId as a separate parameter
- Source manager handles AniList IDs by routing to Yomi
