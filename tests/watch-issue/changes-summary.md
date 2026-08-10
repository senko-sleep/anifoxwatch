# Summary of Changes to Fix Watch Page Hanging Issue

## File Modified: `src/pages/Watch.tsx`

### Change 1: Initialize episode number from URL (Lines 116-119)
```typescript
// Initialize episode number from URL or default to 1
const urlEpParam = searchParams.get('ep');
const initialEpisodeNum = urlEpParam ? parseInt(urlEpParam, 10) : 1;
const [selectedEpisodeNum, setSelectedEpisodeNum] = useState<number>(initialEpisodeNum);
```

**Purpose**: Read the episode number from the URL parameter immediately on mount, so we have it available even before episodes load.

---

### Change 2: Add function to construct episode ID for streaming (Lines 189-203)
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
    return `${cleanAnimeId}?ep=${selectedEpisodeNum}`;
  }
  // Fallback to empty string to disable streaming
  return '';
}, [cleanAnimeId, selectedEpisodeForCurrentAnime, selectedEpisodeNum]);
```

**Purpose**: Construct an episode ID for streaming even when the episodes list hasn't loaded yet. For AniList IDs, we construct it as `anilist-{id}?ep={number}`.

---

### Change 3: Enable streaming when we have an episode ID (Lines 205-209)
```typescript
// Enable streaming if we have an episode ID (either from episodes or constructed)
const isStreamEnabled = useMemo(() => {
  const episodeId = getEpisodeIdForStreaming();
  return episodeId.length > 0;
}, [getEpisodeIdForStreaming]);
```

**Purpose**: Check if we have a valid episode ID (either from the episodes list or constructed), and enable the stream query accordingly.

---

### Change 4: Use the new streaming parameters (Lines 222-224)
```typescript
} = useStreamingLinks(getEpisodeIdForStreaming(), streamServer, audioType, isStreamEnabled, selectedEpisodeNum,
    cleanAnimeId.startsWith('anilist-') ? parseInt(cleanAnimeId.replace('anilist-', ''), 10) || undefined : undefined, anime?.title, bypassCache);
```

**Changes**:
- `episodeId`: Changed from `selectedEpisodeForCurrentAnime || ''` to `getEpisodeIdForStreaming()`
- `enabled`: Changed from `!!selectedEpisodeForCurrentAnime` to `isStreamEnabled`

**Purpose**: Use the constructed episode ID and enable streaming as soon as we have a valid episode ID.

---

### Change 5: Update handleEpisodeSelect to handle constructed IDs (Lines 564-594)
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

**Purpose**: Add logic to prevent re-triggering when we're already on the same episode, with special handling for AniList IDs with constructed episode IDs.

---

### Change 6: Update handlePrevEpisode for AniList IDs (Lines 610-620)
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
```

**Purpose**: Allow navigation to previous episode for AniList IDs even when episodes list is not available.

---

### Change 7: Update handleNextEpisode for AniList IDs (Lines 622-634)
```typescript
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

**Purpose**: Allow navigation to next episode for AniList IDs even when episodes list is not available.

---

### Change 8: Update hasPrev and hasNext for AniList IDs (Line 641)
```typescript
// For AniList IDs, always allow navigation (backend will handle if episode doesn't exist)
// For other IDs, check if there are previous/next episodes in the list
const hasPrev = cleanAnimeId.startsWith('anilist-') ? selectedEpisodeNum > 1 : (episodes?.findIndex(e => e.id === selectedEpisode) ?? -1) > 0;
const hasNext = cleanAnimeId.startsWith('anilist-') ? true : episodes ? (episodes.findIndex(e => e.id === selectedEpisode) ?? 0) < episodes.length - 1 : false;
```

**Purpose**: For AniList IDs, always show prev/next buttons (backend will return an error if the episode doesn't exist). For other IDs, use the existing logic based on the episodes list.

---

## Backward Compatibility

All changes are backward compatible:
- For non-AniList IDs, the behavior remains the same (uses episodes list)
- For AniList IDs, we add a fallback to constructed episode IDs when episodes list is not available
- When episodes list does load, we use the actual episode IDs from the list
- The constructed episode IDs (`anilist-{id}?ep={number}`) are already supported by the backend (Yomi source)

## Benefits

1. **Faster initial load**: For AniList IDs, streaming can start immediately without waiting for episodes to resolve
2. **Better error handling**: If episodes can't be resolved, the user can still watch the anime
3. **Better UX**: Episode navigation works even without the episodes list
4. **Graceful degradation**: Falls back to constructed IDs when needed, uses real IDs when available
