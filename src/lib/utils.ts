import type { CSSProperties } from "react";
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
// Must cover every source the backend registers a prefix for (source-manager's
// prefixMap): one missing here leaves the source's name sitting in the address bar,
// and the slug no longer round-trips to the right title.
const KNOWN_PREFIXES = [
  'animepahe-', 'animekai-',
  '9anime-', 'aniwaves-', 'aniwave-', 'aniwatch-', 'anichi-', 'reanime-', 'yomi-',
  'gogoanime-', 'gogoorat-', 'consumet-', 'zoro-', 'animesuge-', 'allanime-',
  'kaido-', 'anix-', 'kickassanime-', 'yugenanime-', 'animixplay-', 'wcofun-',
  'animefox-', 'animedao-', 'animeflv-', 'animesaturn-', 'crunchyroll-',
  'animeonsen-', 'marin-', 'animeheaven-', 'animekisa-', 'animeowl-',
  'animeland-', 'animefreak-', 'animenana-', 'miruro-',
  'akih-', 'watchhentai-', 'hentaimama-', 'hentaihaven-', 'hanime-',
];

/** The source prefix an id starts with, if any — i.e. "this string is already an id". */
export function sourcePrefixOf(id: string): string | undefined {
  const lower = id.toLowerCase();
  return KNOWN_PREFIXES.find((prefix) => lower.startsWith(prefix));
}

export function stripSourcePrefix(id: string): string {
  const prefix = sourcePrefixOf(id);
  return prefix ? id.slice(prefix.length) : id;
}

/**
 * Generate a clean URL-friendly slug from anime title
 * Converts titles like "Attack on Titan" to "attack-on-titan"
 * Handles special characters and removes anime source prefixes
 */
export function generateAnimeSlug(title: string | undefined | null, id?: string): string {
  // Convert title to string if it's not already
  const titleStr = title != null ? String(title) : '';
  
  if (!titleStr) {
    // Fallback to ID if no title available
    return id ? stripSourcePrefix(id) : 'unknown';
  }
  
  // Clean the title: remove special characters, convert to lowercase, replace spaces with hyphens
  const slug = titleStr
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters except word chars, spaces, hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  
  // If slug is empty after cleaning, use ID fallback
  if (!slug && id) {
    return stripSourcePrefix(id);
  }
  
  return slug || 'unknown';
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

/** Upgrade http:// URLs to https:// to avoid mixed-content browser blocks. */
export function ensureHttps(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('http://')) return trimmed.replace('http://', 'https://');
  return trimmed;
}

/** Poster URL for grid cards — prioritize AniList coverImage (higher quality) over image. */
export function pickAnimePoster(anime: Pick<Anime, 'image' | 'cover' | 'bannerImage' | 'coverImage'>): string {
  // Prioritize AniList's coverImage (high quality cover), then fallback to image, then other sources
  const u = anime.coverImage || anime.image || anime.cover || anime.bannerImage;
  return typeof u === 'string' && u.trim() ? ensureHttps(u) : '';
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

/**
 * Truncate text at word boundaries to avoid mid-word cutoffs.
 * Returns original text if it's shorter than maxLength.
 */
export function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  
  const truncated = text.slice(0, maxLength);
  // Find the last space before the cutoff
  const lastSpaceIndex = truncated.lastIndexOf(' ');
  
  // If no space found or space is too early, just truncate at maxLength
  if (lastSpaceIndex === -1 || lastSpaceIndex < maxLength * 0.5) {
    return truncated + '...';
  }
  
  return truncated.slice(0, lastSpaceIndex) + '...';
}

/**
 * `#3582d8` → `"212 67% 53%"`, the form CSS custom properties want.
 * Returns null for anything that isn't a 6-digit hex colour.
 */
export function hexToHslTriple(hex: string | undefined | null): string | null {
  if (!hex || typeof hex !== 'string') return null;
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }

  // Covers can be muddy or blinding; keep the accent usable as light.
  const sat = Math.min(Math.max(s * 100, 35), 82);
  const lum = Math.min(Math.max(l * 100, 46), 68);
  return `${Math.round(h * 360)} ${Math.round(sat)}% ${Math.round(lum)}%`;
}

/**
 * Inline style that tints a subtree with a title's own cover colour.
 * Everything atmospheric (`--atmos`) inherits from here, so one anime's
 * artwork lights its card, its detail page and its player alike.
 */
export function atmosphereStyle(
  color: string | undefined | null,
  extra?: Record<string, string | number>
): CSSProperties {
  const triple = hexToHslTriple(color);
  return { ...(triple ? { '--atmos': triple } : {}), ...(extra ?? {}) } as CSSProperties;
}
