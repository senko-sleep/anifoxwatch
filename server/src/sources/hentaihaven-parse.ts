/**
 * Pure parsing for hentaihaven.xxx. The site is a Next.js app in front of a WordPress
 * catalogue: listings come from a JSON endpoint (`/api/manga/`), series pages are server
 * rendered, and each episode page carries a schema.org VideoObject whose `contentUrl` is
 * the HLS manifest. No network in here — the markup assumptions live in one place.
 */

import type { CheerioAPI } from 'cheerio';
import type { AnimeBase, Episode } from '../types/anime.js';

export const HH_BASE = 'https://hentaihaven.xxx';
export const HH_IMG = 'https://img.hentaihaven.xxx/';

const clean = (s?: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();

const absolute = (url?: string | null): string => {
    const u = (url ?? '').trim();
    if (!u || u.startsWith('data:')) return '';
    if (u.startsWith('//')) return `https:${u}`;
    return /^https?:\/\//i.test(u) ? u : `${HH_BASE}${u.startsWith('/') ? '' : '/'}${u}`;
};

/** The site's stand-in when a title has no artwork; showing it would be worse than showing nothing. */
export const isPlaceholderImage = (url?: string | null): boolean => !url || /\/hentai-sex\.jpe?g(?:$|\?)/i.test(url);

/**
 * "Kanojo saimin OVA", "Overflow Hentai": the site appends a format or SEO word to some
 * titles. Left in, "OVA" reads as an entry marker and the show no longer matches itself
 * on other sites, so the decoration is dropped.
 */
export const cleanTitle = (t: string): string => {
    const out = clean(t).replace(/\s+(?:hentai|ova)$/i, '').trim();
    return out.length >= 2 ? out : clean(t);
};

export const decodeEntities = (s: string): string =>
    s
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;/g, "'");

// ── Listing (`/api/manga/`) ──────────────────────────────────────────────────

interface ApiItem {
    id: number;
    slug: string;
    title?: { rendered?: string };
    meta?: { vraven_remote_thumbnail?: string };
}

export interface ApiListing {
    data: ApiItem[];
    total?: number;
    totalPages?: number;
    engagement?: Record<string, { rating?: number; views?: number }>;
}

export function parseListing(json: ApiListing): { results: AnimeBase[]; totalPages: number } {
    const results: AnimeBase[] = [];
    for (const item of json.data ?? []) {
        const title = cleanTitle(decodeEntities(item.title?.rendered ?? ''));
        if (!item.slug || !title) continue;

        const thumb = item.meta?.vraven_remote_thumbnail;
        const image = thumb ? absolute(/^https?:/i.test(thumb) ? thumb : HH_IMG + thumb.replace(/^\/+/, '')) : '';
        const stars = json.engagement?.[String(item.id)]?.rating; // 0–5 → the 0–10 scale used elsewhere

        results.push({
            id: `hentaihaven-watch/${item.slug}`,
            title,
            image: isPlaceholderImage(image) ? '' : image,
            description: '',
            type: 'OVA',
            status: 'Completed',
            episodes: 0,
            genres: [],
            rating: stars && stars > 0 ? Math.round(stars * 20) / 10 : undefined,
            isMature: true,
            source: 'HentaiHaven',
        });
    }
    return { results, totalPages: json.totalPages ?? 1 };
}

// ── Series page ──────────────────────────────────────────────────────────────

export interface ParsedHavenSeries {
    anime: AnimeBase;
    episodes: Episode[];
    /** Poster URLs in order of preference; the site's declared full-size image is sometimes a dead link. */
    imageCandidates: string[];
}

/** `episode-8` from a link, for one series only (the page also links recent episodes of other shows). */
const episodeLink = (href: string | undefined, slug: string): number | null => {
    const m = (href ?? '').match(/^\/watch\/([^/]+)\/episode-(\d+)\/?$/);
    return m && m[1] === slug ? parseInt(m[2], 10) : null;
};

export function parseSeries($: CheerioAPI, slug: string): ParsedHavenSeries | null {
    const title = cleanTitle($('h1').first().text());
    if (!title) return null;

    // The page declares its full-size image in `twitter:image` when there is one (the `s_` file is the
    // small variant, and the unprefixed name doesn't exist for every title, so it isn't guessed).
    const declared = $('meta[name="twitter:image"]').attr('content') || '';
    const shown = $('[data-watch-primary] img').first().attr('src') || '';
    const candidates = [declared, shown].filter((u, i, all) => /^https?:/i.test(u) && !isPlaceholderImage(u) && all.indexOf(u) === i);
    const sharp = candidates[0] ?? '';

    const genres = [
        ...new Set(
            $('a[href^="/series/"]')
                .map((_, a) => clean($(a).text()))
                .get()
                .filter((g) => g && g.length < 30 && g.toLowerCase() !== 'uncensored')
        ),
    ];
    const uncensored = $('a[href="/series/uncensored/"]').length > 0;
    const studio = clean($('a[href^="/studio/"]').first().text());
    const year = parseInt(clean($('a[href^="/release/"]').first().text()), 10);
    const rating = parseFloat($('[aria-label^="Average rating"] span').first().text());
    const description = clean($('p.line-clamp-2, p[class*="line-clamp"]').first().text());

    const byNumber = new Map<number, Episode>();
    $('a[href^="/watch/"]').each((_, a) => {
        const number = episodeLink($(a).attr('href'), slug);
        if (number == null) return;
        const img = $(a).find('img').first();
        const thumbnail = absolute(img.attr('src')) || undefined;

        const have = byNumber.get(number);
        if (have) {
            if (!have.thumbnail && thumbnail) have.thumbnail = thumbnail;
            return;
        }
        byNumber.set(number, {
            id: `hentaihaven-episodes/${slug}-episode-${number}`,
            number,
            title: `Episode ${number}`,
            isFiller: false,
            hasSub: true,
            hasDub: false,
            thumbnail,
        });
    });
    const episodes = [...byNumber.values()].sort((a, b) => a.number - b.number);

    const image = isPlaceholderImage(sharp) ? episodes.find((e) => e.thumbnail)?.thumbnail ?? '' : sharp;

    const anime: AnimeBase = {
        id: `hentaihaven-watch/${slug}`,
        title,
        image,
        cover: image || undefined,
        description: /^Watch .* Hentai all episodes/i.test(description) ? '' : description,
        type: 'OVA',
        status: 'Completed',
        rating: Number.isFinite(rating) && rating > 0 ? Math.round(rating * 20) / 10 : undefined,
        year: Number.isFinite(year) ? year : undefined,
        episodes: episodes.length,
        genres,
        studios: studio ? [studio] : undefined,
        uncensored: uncensored || undefined,
        isMature: true,
        source: 'HentaiHaven',
    };
    return { anime, episodes, imageCandidates: candidates };
}

// ── Episode page ─────────────────────────────────────────────────────────────

export interface ParsedHavenEpisode {
    manifest: string;
    duration?: string;
    thumbnail?: string;
}

/** The VideoObject JSON-LD: `contentUrl` is the HLS playlist. */
export function parseEpisode($: CheerioAPI): ParsedHavenEpisode | null {
    for (const el of $('script[type="application/ld+json"]').toArray()) {
        try {
            const data = JSON.parse($(el).contents().text()) as Record<string, unknown>;
            const nodes = Array.isArray(data['@graph']) ? (data['@graph'] as Record<string, unknown>[]) : [data];
            for (const n of nodes) {
                if (n['@type'] === 'VideoObject' && typeof n.contentUrl === 'string' && n.contentUrl) {
                    const thumb = Array.isArray(n.thumbnailUrl) ? n.thumbnailUrl[0] : n.thumbnailUrl;
                    return {
                        manifest: n.contentUrl,
                        duration: typeof n.duration === 'string' ? n.duration : undefined,
                        thumbnail: typeof thumb === 'string' ? thumb : undefined,
                    };
                }
            }
        } catch {
            /* not this script */
        }
    }
    return null;
}

/**
 * The master playlist lists its subtitles as `#EXT-X-MEDIA:TYPE=SUBTITLES` renditions that point
 * straight at .vtt files. hls.js can't take those as playlists, so they are handed to the player
 * as ordinary subtitle tracks instead. English first.
 */
export function parseMasterSubtitles(master: string, manifestUrl: string): { url: string; lang: string; label: string }[] {
    const out: { url: string; lang: string; label: string }[] = [];
    for (const line of master.split(/\r?\n/)) {
        if (!/^#EXT-X-MEDIA:/.test(line) || !/TYPE=SUBTITLES/i.test(line)) continue;
        const uri = line.match(/URI="([^"]+)"/)?.[1];
        const lang = line.match(/LANGUAGE="([^"]+)"/)?.[1];
        if (!uri || !lang || !/\.vtt(?:$|\?)/i.test(uri)) continue;
        const label = line.match(/NAME="([^"]+)"/)?.[1] ?? lang;
        try {
            out.push({ url: new URL(uri, manifestUrl).href, lang, label });
        } catch {
            /* unusable URI */
        }
    }
    return out.sort((a, b) => Number(b.lang === 'en') - Number(a.lang === 'en'));
}
