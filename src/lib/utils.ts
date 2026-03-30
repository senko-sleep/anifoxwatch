import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
