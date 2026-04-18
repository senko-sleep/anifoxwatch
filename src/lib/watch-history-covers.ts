import { ensureHttps } from '@/lib/utils';
import {
  fetchAniListCoversByMediaIds,
  lookupCachedAnilistPosterByTitle,
  lookupCachedAnilistPosterByMediaId,
  resolveAnilistPosterUrlsForTitles,
} from '@/lib/anilist-covers';
import type { WatchHistoryItem } from '@/lib/watch-history';
import { WatchHistory } from '@/lib/watch-history';

const ANILIST_ID_RE = /^anilist-(\d+)$/i;

/** Sync: use session caches so first paint can show AniList posters immediately. */
export function applyCachedCoversToHistoryItems(items: WatchHistoryItem[]): WatchHistoryItem[] {
  if (!items.length) return items;
  return items.map((it) => {
    const m = it.animeId.match(ANILIST_ID_RE);
    if (m) {
      const id = parseInt(m[1], 10);
      const u = lookupCachedAnilistPosterByMediaId(id);
      if (u) return { ...it, animeImage: ensureHttps(u) };
    }
    const u = lookupCachedAnilistPosterByTitle(it.animeTitle);
    if (u) return { ...it, animeImage: ensureHttps(u) };
    return { ...it, animeImage: ensureHttps(it.animeImage) };
  });
}

/**
 * Resolve stable AniList CDN covers for history (by media id or title), optionally persisting to localStorage.
 */
export async function enrichWatchHistoryImages(
  items: WatchHistoryItem[],
  options?: { persistToStorage?: boolean }
): Promise<WatchHistoryItem[]> {
  const persist = options?.persistToStorage !== false;
  if (items.length === 0) return items;

  try {
    const origById = new Map(items.map((it) => [it.animeId, it]));
    let working = items.map((i) => ({ ...i }));

    const idList = [
      ...new Set(
        working
          .map((it) => {
            const m = it.animeId.match(ANILIST_ID_RE);
            return m ? parseInt(m[1], 10) : null;
          })
          .filter((x): x is number => x != null)
      ),
    ];

    let idToUrl = await fetchAniListCoversByMediaIds(idList);
    const stillMissingIds = idList.filter((id) => !idToUrl.has(id));
    if (stillMissingIds.length > 0) {
      await new Promise((r) => setTimeout(r, 900));
      const second = await fetchAniListCoversByMediaIds(stillMissingIds);
      for (const [k, v] of second) idToUrl.set(k, v);
    }

    working = working.map((it) => {
      const m = it.animeId.match(ANILIST_ID_RE);
      if (!m) return it;
      const url = idToUrl.get(parseInt(m[1], 10));
      return url ? { ...it, animeImage: ensureHttps(url) } : it;
    });

    const titlesToResolve = [
      ...new Set(
        working
          .filter((it) => {
            if (!it.animeTitle?.trim()) return false;
            if (lookupCachedAnilistPosterByTitle(it.animeTitle)) return false;
            const m = it.animeId.match(ANILIST_ID_RE);
            if (m) {
              const id = parseInt(m[1], 10);
              return !idToUrl.has(id);
            }
            return true;
          })
          .map((it) => it.animeTitle)
      ),
    ];

    const titleMap = await resolveAnilistPosterUrlsForTitles(titlesToResolve);
    working = working.map((it) => {
      const fromTitle = titleMap.get(it.animeTitle);
      if (fromTitle) return { ...it, animeImage: ensureHttps(fromTitle) };
      const cached = lookupCachedAnilistPosterByTitle(it.animeTitle);
      if (cached && !it.animeImage?.trim()) return { ...it, animeImage: ensureHttps(cached) };
      return { ...it, animeImage: ensureHttps(it.animeImage) };
    });

    if (persist) {
      for (const next of working) {
        const orig = origById.get(next.animeId);
        if (orig && orig.animeImage !== next.animeImage && next.animeImage?.trim()) {
          WatchHistory.patchAnimeImage(next.animeId, next.animeImage);
        }
      }
    }

    return working;
  } catch {
    return applyCachedCoversToHistoryItems(items);
  }
}
