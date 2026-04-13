import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Anime } from '@/types/anime';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalize rating to 0-10 scale regardless of input format.
 * Handles: 0-10 scale (pass through), 0-100 scale (divide by 10).
 * Returns null for invalid/missing ratings.
 * Filters out suspiciously low values (< 1.0 on 0-10 scale).
 */
export function normalizeRating(rating: number | undefined | null): number | null {
  if (!rating || rating <= 0) return null;
  if (rating > 100) return null;
  const normalized = rating > 10
    ? Math.round((rating / 10) * 10) / 10
    : Math.round(rating * 10) / 10;
  // Filter out bogus low ratings (likely bad data)
  return normalized >= 1.0 ? normalized : null;
}

/**
 * Format a normalized rating for display
 */
export function formatRating(rating: number | undefined | null): string | null {
  const n = normalizeRating(rating);
  return n !== null ? n.toFixed(1) : null;
}

/** Real calendar year only — avoids `year: 0` leaking as text from `{year && …}` */
export function isValidAnimeYear(year: number | undefined | null): boolean {
  if (year == null) return false;
  const y = Number(year);
  return Number.isFinite(y) && y >= 1900 && y <= 2100;
}

export function isValidEpisodeCount(n: number | undefined | null): boolean {
  if (n == null) return false;
  const v = Number(n);
  return Number.isFinite(v) && v > 0;
}

/**
 * Strip known streaming-source prefixes from an anime ID so URLs stay clean.
 * The backend's extractRawId handles prefixed IDs transparently, so raw slugs work.
 */
const KNOWN_PREFIXES = [
  'animepahe-', 'animekai-',
  '9anime-', 'aniwave-', 'aniwatch-',
  'gogoanime-', 'consumet-', 'zoro-', 'animesuge-',
  'kaido-', 'anix-', 'kickassanime-', 'yugenanime-', 'animixplay-',
  'animefox-', 'animedao-', 'animeflv-', 'animesaturn-', 'crunchyroll-',
  'animeonsen-', 'marin-', 'animeheaven-', 'animekisa-', 'animeowl-',
  'animeland-', 'animefreak-', 'miruro-', 'akih-', 'watchhentai-', 'hanime-',
];

export function stripSourcePrefix(id: string): string {
  const lower = id.toLowerCase();
  for (const prefix of KNOWN_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return id.slice(prefix.length);
    }
  }
  return id;
}

/** Skip API placeholders like "00", "0 min" */
export function isValidDurationLabel(s: string | undefined | null): boolean {
  if (s == null || typeof s !== 'string') return false;
  const t = s.trim();
  if (!t) return false;
  const one = t.replace(/\s+/g, ' ');
  if (/^0+( min)?$/i.test(one)) return false;
  if (/^0+(\.0+)?\s*(min|m|hr|h|ep)?$/i.test(one)) return false;
  return true;
}

/** Poster URL for grid cards — many sources set `cover` or AniList fields but leave `image` empty. */
export function pickAnimePoster(anime: Pick<Anime, 'image' | 'cover' | 'bannerImage' | 'coverImage'>): string {
  const u = anime.image || anime.cover || anime.bannerImage || anime.coverImage;
  return typeof u === 'string' && u.trim() ? u.trim() : '';
}

/** True when text looks like scraped MAL-style metadata rather than a title/studio/genre label. */
export function looksLikeMalMetadataBlob(raw: string | undefined | null): boolean {
  if (raw == null || typeof raw !== 'string') return false;
  const t = raw.trim();
  if (!t) return false;
  if (t.length > 80) return true;
  return /\b(Country|Premiered|Date aired|Broadcast|Duration|Studios|Source):\s*/i.test(t);
}

function dedupeCaseInsensitive(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of items) {
    const k = x.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

/**
 * Split polluted genre strings (e.g. whole "Country: … Genres: …" blocks) into real genre names.
 * Keeps normal short genre tags; drops metadata-only lines.
 */
export function normalizeAnimeGenresForDisplay(genres: string[] | undefined | null): string[] {
  if (!genres?.length) return [];

  const fromBlob = (raw: string): string[] => {
    if (!raw) return [];
    const t = raw.trim();
    if (!t) return [];

    if (t.includes('\n') || /\bCountry:\s*/i.test(t) || /\bPremiered:\s*/i.test(t) || /\bDate aired:\s*/i.test(t)) {
      const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const collected: string[] = [];
      for (const line of lines) {
        const m = line.match(/^Genres?:\s*(.+)$/i);
        if (m) {
          collected.push(...m[1].split(',').map((s) => s.trim()).filter(Boolean));
        }
      }
      if (collected.length) return dedupeCaseInsensitive(collected);

      const inline = t.match(
        /\bGenres?:\s*([^.]+?)(?=\s*(?:Premiered|Date aired|Broadcast|Episodes|Duration)\b|$)/i
      );
      if (inline) {
        return dedupeCaseInsensitive(
          inline[1].split(',').map((s) => s.trim()).filter(Boolean)
        );
      }
      return [];
    }

    if (/^(Country|Premiered|Date aired|Broadcast|Episodes|Duration|Studios|Source):\s*/i.test(t)) {
      return [];
    }

    const gLine = t.match(/^Genres?:\s*(.+)$/i);
    if (gLine) {
      return dedupeCaseInsensitive(
        gLine[1].split(',').map((s) => s.trim()).filter(Boolean)
      );
    }

    return [t];
  };

  const flat: string[] = [];
  for (const g of genres) {
    flat.push(...fromBlob(g));
  }
  return dedupeCaseInsensitive(flat).slice(0, 12);
}

/** Drop studio entries that are actually synopsis/metadata blobs from bad API fields. */
export function sanitizeAnimeStudiosForDisplay(studios: string[] | undefined | null): string[] {
  if (!studios?.length) return [];
  return studios.filter((s) => {
    const t = (s || '').trim();
    if (!t) return false;
    if (looksLikeMalMetadataBlob(t)) return false;
    if (/^Genres?:\s*/i.test(t)) return false;
    return true;
  });
}

/** Only show duration when it looks like a real label (e.g. "24 min"), not a metadata dump. */
export function sanitizeAnimeDurationForDisplay(d: string | undefined | null): string | undefined {
  if (d == null || typeof d !== 'string') return undefined;
  const t = d.trim();
  if (!t) return undefined;
  if (looksLikeMalMetadataBlob(t)) return undefined;
  if (t.length > 24) return undefined;
  return isValidDurationLabel(t) ? t : undefined;
}

/** List/search payloads often use empty strings or API stubs instead of a real synopsis. */
export function isPlaceholderAnimeDescription(raw: string | undefined | null): boolean {
  if (raw == null || typeof raw !== 'string') return true;
  const t = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length === 0) return true;
  const low = t.toLowerCase().replace(/[.…]+$/g, '').trim();
  if (low.includes('no description available')) return true;
  if (low === 'no description' || low.startsWith('no description ')) return true;
  if (low.includes('could not fetch description')) return true;
  if (low === 'n/a' || low === 'n/a.' || low === 'tba' || low === 'tbd') return true;
  if (low === 'hentai video') return true;
  if (low.includes('trending title from our catalog')) return true;
  return false;
}

/** Composed line when no synopsis exists — still helps users decide to watch. */
export function buildAnimeWatchBlurb(anime: Pick<Anime, 'title' | 'genres' | 'type' | 'status' | 'year' | 'episodes' | 'subCount' | 'dubCount'>): string {
  const g = anime.genres?.filter(Boolean).slice(0, 4) ?? [];
  const year = isValidAnimeYear(anime.year) ? String(anime.year) : '';
  const eps = isValidEpisodeCount(anime.episodes) ? `${anime.episodes} episodes` : '';
  const sub = (anime.subCount ?? 0) > 0;
  const dub = (anime.dubCount ?? 0) > 0;
  const audio =
    sub && dub ? 'Sub & Dub' : sub ? 'Subtitled' : dub ? 'Dubbed' : 'Check player for audio';

  let s = g.length
    ? `${anime.title} — ${g.join(', ')}. ${anime.type}, ${anime.status}`
    : `${anime.title} — ${anime.type}, ${anime.status}`;
  if (year) s += ` (${year})`;
  if (eps) s += `. ${eps}`;
  s += `. ${audio}.`;
  return s;
}

/**
 * Deduplicate search hits by normalized title; prefer `animekai-*` or `akih-*` IDs for streaming.
 * Do not strip spaces (that collapses unrelated titles and drops rows vs. the header search).
 */
export function dedupeSearchResultsForGrid<T extends { id: string; title: string }>(results: T[]): T[] {
  const normalizeTitle = (title: string): string =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const seen = new Map<string, T>();
  for (const anime of results) {
    const key = normalizeTitle(anime.title || '');
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, anime);
    } else {
      const existingIsKai = existing.id?.startsWith('animekai-');
      const existingIsAkiH = existing.id?.startsWith('akih-');
      const newIsKai = anime.id?.startsWith('animekai-');
      const newIsAkiH = anime.id?.startsWith('akih-');
      
      // Prefer animekai or akih IDs over other sources
      const existingPriority = existingIsKai ? 2 : (existingIsAkiH ? 1 : 0);
      const newPriority = newIsKai ? 2 : (newIsAkiH ? 1 : 0);
      
      if (newPriority > existingPriority) {
        seen.set(key, anime);
      }
    }
  }
  return Array.from(seen.values());
}
