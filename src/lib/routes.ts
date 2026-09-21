/**
 * Canonical URL shapes for the whole app. Every link goes through here so the
 * address bar, browser history and share links stay predictable:
 *
 *   /anime/attack-on-titan-16498              → title page
 *   /watch/anime/attack-on-titan-16498?ep=3   → player, episode 3
 *   /browse?genres=Action&sort=trending       → browsing state lives in the query
 *
 * Adult titles live in their own URL space, so the address says which catalog
 * it belongs to and nothing has to be carried in the query:
 *
 *   /hentai/overflow-al113417                 → title page (catalog title; `al` = its AniList id)
 *   /hentai/muramata-san-no-aijou             → title page (a title only WatchHentai has)
 *   /hentai/hm--kanojo-saimin                 → title page (a title only HentaiMama has)
 *   /hentai/hh--kanojo-saimin-ova             → title page (a title only HentaiHaven has)
 *   /watch/hentai/muramata-san-no-aijou?ep=1  → player, episode 1
 */

import { generateAnimeSlug, stripSourcePrefix } from '@/lib/utils';

export interface AnimeRef {
  id: string;
  title?: string | null;
  titleEnglish?: string | null;
  titleRomaji?: string | null;
  genres?: (string | null)[] | null;
  source?: string | null;
  isMature?: boolean | null;
}

const ADULT_ID_PREFIXES = ['watchhentai-', 'hentaimama-', 'hentaihaven-', 'hanime-', 'akih-', 'hentai-'];

/** True when a title belongs to the adult catalog (explicit flag, genre or source id). */
export function isAdultRef(ref: AnimeRef): boolean {
  const id = String(ref.id ?? '').toLowerCase();
  const source = String(ref.source ?? '').toLowerCase();
  const genres = (ref.genres ?? []).filter(Boolean).map((g) => String(g).toLowerCase());
  return (
    ref.isMature === true ||
    genres.includes('hentai') ||
    source.includes('hentai') ||
    source.includes('hanime') ||
    ADULT_ID_PREFIXES.some((p) => id.startsWith(p))
  );
}

/** WatchHentai lists every title as `series/<slug>` — that slug *is* the URL slug. */
const WATCHHENTAI_SERIES = 'watchhentai-series/';
const HENTAIMAMA_SERIES = 'hentaimama-tvshows/';
const HENTAIHAVEN_SERIES = 'hentaihaven-watch/';

/**
 * True when a title's own id is a source-native adult id, which puts it in the
 * `/hentai/…` URL space. Deliberately narrower than `isAdultRef`: AniList entries
 * that are merely flagged mature keep their normal `/anime/…` pages.
 * 
 * Updated: Also consider AniList IDs marked as mature as hentai paths since
 * adult search now returns AniList results.
 */
export function isHentaiPath(ref: AnimeRef): boolean {
  const id = String(ref.id ?? '').toLowerCase();
  // Check for adult source prefixes
  if (ADULT_ID_PREFIXES.some((p) => id.startsWith(p))) return true;
  // Check for AniList IDs that are marked as mature
  if (id.startsWith('anilist-') && ref.isMature === true) return true;
  return false;
}

/**
 * `/hentai/<slug>` → the id the API knows. Deterministic, so no lookup is needed.
 * Ids that already carry a source prefix pass straight through, and the old
 * `series-<slug>` spelling from earlier links is accepted.
 */
export function hentaiSlugToId(slug: string): string {
  const s = decodeURIComponent(slug).trim();
  // A full source id passes through. (Not `hentai-…`: that's also how real titles like
  // "Hentai Prison" begin, and a catalog id is never typed into a URL — it's `<title>-al<n>`.)
  if (/^(watchhentai|hentaimama|hentaihaven)-/i.test(s)) return s;

  const catalog = s.match(/-al(\d{1,9})$/);
  if (catalog) return `hentai-${catalog[1]}`;
  if (s.startsWith('hm--')) return `${HENTAIMAMA_SERIES}${s.slice(4)}`;
  if (s.startsWith('hh--')) return `${HENTAIHAVEN_SERIES}${s.slice(4)}`;
  return `${WATCHHENTAI_SERIES}${s.replace(/^series-/i, '').replace(/\/+$/, '')}`;
}

/**
 * Human-readable slug that still round-trips to an id.
 * AniList ids become `title-<anilistId>`; every other source keeps its own slug,
 * which the backend's /api/anime/resolve-slug turns back into an id.
 */
export function animeSlug(ref: AnimeRef): string {
  const id = String(ref.id ?? '').trim();
  const title = ref.titleEnglish || ref.title || ref.titleRomaji || '';

  const anilistMatch = id.match(/^anilist-(\d+)$/i);
  if (anilistMatch) {
    const base = generateAnimeSlug(title, id);
    // In the adult URL space the slug must be the catalog's `-al<id>` form to resolve there.
    if (isHentaiPath(ref)) return `${base && base !== 'unknown' ? base : 'title'}-al${anilistMatch[1]}`;
    return base && base !== 'unknown' ? `${base}-${anilistMatch[1]}` : anilistMatch[1];
  }

  // Adult catalog title: `hentai-<anilistId>` ↔ `<title>-al<anilistId>`.
  const catalog = id.match(/^hentai-(\d+)$/i);
  if (catalog) {
    const base = generateAnimeSlug(title, id);
    return `${base && base !== 'unknown' ? base : 'title'}-al${catalog[1]}`;
  }
  if (id.toLowerCase().startsWith(HENTAIMAMA_SERIES)) {
    return `hm--${id.slice(HENTAIMAMA_SERIES.length).replace(/\/+$/, '')}`;
  }

  if (id.toLowerCase().startsWith(HENTAIHAVEN_SERIES)) {
    return `hh--${id.slice(HENTAIHAVEN_SERIES.length).replace(/\/+$/, '')}`;
  }

  if (id.toLowerCase().startsWith(WATCHHENTAI_SERIES)) {
    return id.slice(WATCHHENTAI_SERIES.length).replace(/\/+$/, '');
  }

  const bare = stripSourcePrefix(id).replace(/\//g, '-');
  return bare || generateAnimeSlug(title, id);
}

function extraOnly(extra = ''): string {
  const q = new URLSearchParams(extra.replace(/^\?/, '')).toString();
  return q ? `?${q}` : '';
}

/** Title page: `/anime/<slug>` */
export function animePath(ref: AnimeRef, extraQuery = ''): string {
  const base = isHentaiPath(ref) ? '/hentai' : '/anime';
  return `${base}/${encodeURIComponent(animeSlug(ref))}${extraOnly(extraQuery)}`;
}

/** Player: `/watch/anime/<slug>?ep=<n>&s=<season>` (either omitted when unknown). */
export function watchPath(
  ref: AnimeRef,
  episode?: number | null,
  extraQuery = '',
  season?: number | null
): string {
  return watchPathForSlug(animeSlug(ref), episode, extraOnly(extraQuery), season, isHentaiPath(ref));
}

/**
 * Same shape as `watchPath`, for code that already holds a slug. Episode and
 * season live in the query (`?ep=1&s=1`) rather than the path, so moving between
 * them is a query change and any other player state (mode, source) rides along
 * untouched. `s` is the season's place in the franchise, which each source keys
 * differently — the slug still decides which entry actually plays.
 */
export function watchPathForSlug(
  slug: string,
  episode?: number | null,
  query = '',
  season?: number | null,
  adult = false
): string {
  const params = new URLSearchParams(query.replace(/^\?/, ''));
  if (episode != null && episode > 0) params.set('ep', String(Math.floor(episode)));
  else params.delete('ep');
  if (season != null && season > 0) params.set('s', String(Math.floor(season)));
  const q = params.toString();
  return `/watch/${adult ? 'hentai' : 'anime'}/${encodeURIComponent(slug)}${q ? `?${q}` : ''}`;
}

/** `?s=2` → 2. Anything else → null. */
export function parseSeasonParam(value: string | null | undefined): number | null {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Same, for a slug that already resolved to a title page. */
export function animePathForSlug(slug: string, query = '', adult = false): string {
  return `/${adult ? 'hentai' : 'anime'}/${encodeURIComponent(slug)}${query}`;
}

/** `episode-12` | `12` → 12. Anything else → null. */
export function parseEpisodeSegment(segment: string | undefined | null): number | null {
  if (!segment) return null;
  const m = String(segment).match(/^(?:episode-|ep-|e)?(\d{1,5})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Browse URL with only the filters that are actually set. */
export function browsePath(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '' || v === 'all') continue;
    sp.set(k, String(v));
  }
  const q = sp.toString();
  return q ? `/browse?${q}` : '/browse';
}

/** Search URL — the query is always in the address bar so results are shareable. */
export function searchPath(query: string, extra?: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  if (query.trim()) sp.set('q', query.trim());
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v) sp.set(k, v);
  }
  const q = sp.toString();
  return q ? `/search?${q}` : '/search';
}

export function genrePath(genre: string): string {
  return browsePath({ genres: genre });
}
