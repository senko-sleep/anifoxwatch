import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-config';
import { hentaiSlugToId } from '@/lib/routes';
import { sourcePrefixOf } from '@/lib/utils';

/**
 * URLs carry a readable slug (`attack-on-titan-16498`); the API wants an id
 * (`anilist-16498`). Slugs ending in digits resolve locally — everything else
 * asks the backend once and caches the answer for the session.
 */
const resolveCache = new Map<string, string>();

export function useResolvedAnimeId(slug: string | undefined, mode: 'safe' | 'adult' = 'safe') {
  const raw = slug ?? '';
  const [resolvedId, setResolvedId] = useState<string>(() => resolveLocally(raw, mode) ?? resolveCache.get(`${mode}:${raw}`) ?? '');
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    if (!raw) {
      setResolvedId('');
      return;
    }

    const local = resolveLocally(raw, mode);
    if (local) {
      setResolvedId(local);
      return;
    }

    const cacheKey = `${mode}:${raw}`;
    const cached = resolveCache.get(cacheKey);
    if (cached) {
      setResolvedId(cached);
      return;
    }

    let cancelled = false;
    setIsResolving(true);
    fetch(apiUrl(`/api/anime/resolve-slug?slug=${encodeURIComponent(raw)}&mode=${mode}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const id = (data && data.id) || raw;
        resolveCache.set(cacheKey, id);
        setResolvedId(id);
      })
      .catch(() => {
        if (!cancelled) setResolvedId(raw);
      })
      .finally(() => {
        if (!cancelled) setIsResolving(false);
      });

    return () => { cancelled = true; };
  }, [raw, mode]);

  return { animeId: resolvedId || raw, isResolving };
}

/**
 * Ids we can name without asking: an explicit id, a bare AniList number, or a slug that
 * already carries a source prefix.
 *
 * A trailing number is deliberately *not* one of them. `attack-on-titan-16498` ends in an
 * AniList id, but `spy-x-family-season-3-82391` ends in a streaming source's own id, and
 * the two are indistinguishable here — guessing loads a different anime under the right
 * name. Those go to the backend, which checks the entry really is that title.
 */
function resolveLocally(slug: string, mode: 'safe' | 'adult' = 'safe'): string | null {
  if (!slug) return null;
  // /hentai/<slug> is the source's own slug — never guess an AniList id from a trailing number
  // ("…-id-01" would otherwise read as anilist-01).
  if (mode === 'adult') return hentaiSlugToId(slug);
  if (/^anilist-\d+$/i.test(slug)) return slug;
  if (/^\d+$/.test(slug)) return `anilist-${slug}`;
  if (sourcePrefixOf(slug)) return slug;
  return null;
}
