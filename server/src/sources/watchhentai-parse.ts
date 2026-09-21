/**
 * Pure parsing for watchhentai.net pages. No network, no state — HTML in, typed
 * data out — so the markup assumptions live in one place and can be tested apart
 * from the scraper. Everything here reads what the site actually publishes:
 * poster, synopsis, genres, release date, studio, rating, and a still per episode.
 */

import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { AnimeBase, Episode } from '../types/anime.js';

export const WH_BASE = 'https://watchhentai.net';

/**
 * Content we never list, whatever the source publishes. These tags mark material
 * that sexualises children; it is excluded from genres, browsing and title pages.
 */
export const BLOCKED_GENRES = new Set(['lolicon', 'shota', 'shotacon']);

export const isBlockedGenre = (g: string): boolean =>
    BLOCKED_GENRES.has(g.toLowerCase().replace(/[^a-z]/g, ''));

const clean = (s?: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** The site's SEO decoration ("Watch Hentai X", "X - Watch Hentai, Stream Online…") isn't part of a title. */
const cleanTitle = (s?: string | null): string =>
    clean(s)
        .replace(/^watch\s+hentai\s+/i, '')
        .replace(/\s*[-–|]\s*watch\s+hentai.*$/i, '')
        .trim();

const absolute = (url?: string | null): string => {
    const u = (url ?? '').trim();
    if (!u) return '';
    if (u.startsWith('//')) return `https:${u}`;
    if (/^https?:\/\//i.test(u)) return u;
    return `${WH_BASE}${u.startsWith('/') ? '' : '/'}${u}`;
};

/** Images are lazy-loaded: the real URL is in data-src, `src` is an inline placeholder. */
const imageOf = (img: Cheerio<AnyNode>): string => {
    const lazy = img.attr('data-src') || img.attr('data-lazy-src') || '';
    const src = img.attr('src') || '';
    return absolute(lazy || (src.startsWith('data:') ? '' : src));
};

export const seriesSlugFromUrl = (href?: string | null): string | null =>
    (href ?? '').match(/\/series\/([^/?#]+)/)?.[1] ?? null;

/** "Aug. 28, 2026" → Date (the site abbreviates months with a trailing dot). */
const parseSiteDate = (text: string): Date | null => {
    const d = new Date(clean(text).replace(/\./g, ''));
    return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Listing / search / genre / home cards.
 * `Upcoming` in the year badge means the title has been announced but not released —
 * the source only carries a teaser clip for those.
 */
export function parseCards($: CheerioAPI): AnimeBase[] {
    const out: AnimeBase[] = [];
    const seen = new Set<string>();

    $('article').each((_, el) => {
        const $el = $(el);
        const link = $el.find('a[href*="/series/"]').filter((_i, a) => !!seriesSlugFromUrl($(a).attr('href'))).first();
        const slug = seriesSlugFromUrl(link.attr('href'));
        if (!slug || seen.has(slug)) return;

        const img = $el.find('.poster img, img').first();
        const title = cleanTitle(
            $el.find('h3 a, .data a, .title a').first().text() || link.attr('title') || img.attr('alt') || ''
        );
        if (!title) return;
        seen.add(slug);

        const badge = clean($el.find('.buttonyear').first().text());
        const censor = clean($el.find('.buttoncensured').first().text()).toUpperCase();

        out.push({
            id: `watchhentai-series/${slug}`,
            title,
            image: imageOf(img),
            description: '',
            type: 'OVA',
            status: /upcoming/i.test(badge) ? 'Upcoming' : 'Completed',
            episodes: 0,
            genres: [],
            year: /^\d{4}$/.test(badge) ? parseInt(badge, 10) : undefined,
            uncensored: censor === 'UNC' ? true : undefined,
            isMature: true,
            source: 'WatchHentai',
        });
    });

    return out;
}

/** Last page number visible in a listing's pagination (1 when there is none). */
export function parseLastPage($: CheerioAPI): number {
    let last = 1;
    $('a[href*="/page/"]').each((_, a) => {
        const n = parseInt(($(a).attr('href') ?? '').match(/\/page\/(\d+)/)?.[1] ?? '', 10);
        if (Number.isFinite(n) && n > last) last = n;
    });
    const text = clean($('.pagination span').first().text()).match(/Page \d+ of (\d+)/);
    if (text) last = Math.max(last, parseInt(text[1], 10));
    return last;
}

export const hasNextPage = ($: CheerioAPI, page: number): boolean =>
    $('#nextpagination, link[rel="next"], a.next').length > 0 || page < parseLastPage($);

/** Slugs of the home page's "Featured Series" block, in display order. */
export function parseFeaturedSlugs($: CheerioAPI): string[] {
    const slugs: string[] = [];
    $('.home-featured-section a[href*="/series/"]').each((_, a) => {
        const slug = seriesSlugFromUrl($(a).attr('href'));
        if (slug && !slugs.includes(slug)) slugs.push(slug);
    });
    return slugs;
}

export interface ParsedSeries {
    anime: AnimeBase;
    episodes: Episode[];
}

/** A series page: full details plus its own episode list, with a still for each. */
export function parseSeries($: CheerioAPI, slug: string): ParsedSeries | null {
    const title = cleanTitle($('.data h1').first().text() || $('h1').first().text());
    if (!title) return null;

    const poster = imageOf($('.poster img').first());
    const banner = absolute($('meta[property="og:image"]').attr('content'));

    const description = clean($('.sbox .wp-content').first().text()).replace(/^Synopsis\s*/i, '');
    const tags = $('.sgeneros a')
        .map((_, a) => clean($(a).text()))
        .get()
        .filter(Boolean);
    // "Upcoming" is how the site marks an announced-but-unreleased title. It's a status, not a genre.
    const hasUpcomingTag = tags.some((t) => /^upcoming$/i.test(t));
    const genres = tags.filter((t) => !/^upcoming$/i.test(t));

    const released = parseSiteDate($('.extra .date').first().text());
    const studio = clean($('.extra .studio').first().text());
    const declared = parseInt(clean($('.extra .episodes').first().text()).match(/(\d+)/)?.[1] ?? '', 10);

    const rating = parseFloat($('[itemprop="ratingValue"]').attr('content') ?? '');

    // Only the series' own list — the page also carries sidebars of other titles' videos.
    const episodes: Episode[] = [];
    $('.episodios li').each((_, li) => {
        const $li = $(li);
        const href = $li.find('a.tv-ep-card-link, a[href*="/videos/"]').first().attr('href') ?? '';
        const videoSlug = href.match(/\/videos\/([^/?#]+)/)?.[1];
        if (!videoSlug) return;

        const label = clean($li.find('.eptitle').text());
        const number =
            parseInt(label.match(/(\d+)/)?.[1] ?? '', 10) ||
            parseInt(videoSlug.match(/episode-(\d+)/i)?.[1] ?? '', 10) ||
            episodes.length + 1;

        episodes.push({
            id: `watchhentai-videos/${videoSlug}`,
            number,
            title: label || `Episode ${number}`,
            isFiller: false,
            hasSub: true,
            hasDub: false,
            thumbnail: imageOf($li.find('img').first()) || undefined,
        });
    });
    episodes.sort((a, b) => a.number - b.number);

    const upcoming = hasUpcomingTag || (released ? released.getTime() > Date.now() : false);

    const anime: AnimeBase = {
        id: `watchhentai-series/${slug}`,
        title,
        image: poster || banner,
        cover: poster || undefined,
        banner: banner || undefined,
        description,
        type: 'OVA',
        status: upcoming ? 'Upcoming' : 'Completed',
        rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
        episodes: Number.isFinite(declared) ? declared : episodes.length,
        genres,
        studios: studio ? [studio] : undefined,
        year: released?.getFullYear(),
        uncensored: genres.some((g) => /uncensored/i.test(g)) || undefined,
        isMature: true,
        source: 'WatchHentai',
    };

    return { anime, episodes };
}
