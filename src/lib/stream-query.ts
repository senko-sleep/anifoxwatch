/** One identity for foreground and prefetched streams. Metadata enrichment must
 * not start another extraction when a canonical AniList ID is already known. */
export function streamQueryKey(episodeId: string, server?: string, category?: string,
  episodeNum?: number, anilistId?: number, title?: string, bypassCache = false,
  excludedProviders: string[] = []) {
  return ['stream', episodeId, server, category, episodeNum, anilistId,
    anilistId ? undefined : title, Boolean(bypassCache), [...new Set(excludedProviders)].sort().join(',')] as const;
}
