/**
 * Pure parsing for hentaimama.io pages (a DooPlay WordPress theme). HTML in,
 * typed data out — no network — so the markup assumptions live in one place.
 */

import type { CheerioAPI } from 'cheerio';
import type { AnimeBase, Episode } from '../types/anime.js';

export const HM_BASE = 'https://hentaimama.io';

const clean = (s?: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();

const absolute = (url?: string | null): string => {
    const u = (url ?? '').trim();
    if (!u) return '';
    if (u.startsWith('//')) return `https:${u}`;
    return /^https?:\/\//i.test(u) ? u : `${HM_BASE}${u.startsWith('/') ? '' : '/'}${u}`;
};

export const tvshowSlug = (href?: string | null): string | null =>
    (href ?? '').match(/\/tvshows\/([^/?#]+)/)?.[1] ?? null;

/** Listing cards (`/tvshows/`, genre pages, home): poster, title, year, rating. */
export function parseCards($: CheerioAPI): AnimeBase[] {
    const out: AnimeBase[] = [];
    const seen = new Set<string>();

    $('article.item, article').each((_, el) => {
        const $el = $(el);
        const link = $el.find('a[href*="/tvshows/"]').first();
        const slug = tvshowSlug(link.attr('href'));
        if (!slug || seen.has(slug)) return;

        const img = $el.find('img').first();
        const title = clean($el.find('.title, h3').first().text() || img.attr('alt'));
        if (!title) return;
        seen.add(slug);

        const yearText = clean($el.find('.data span').first().text());
        const rating = parseFloat(clean($el.find('.rating').first().text()));

        out.push({
            id: `hentaimama-tvshows/${slug}`,
            title,
            image: absolute(img.attr('data-src') || img.attr('src')),
            description: '',
            type: 'OVA',
            status: 'Completed',
            episodes: 0,
            genres: [],
            year: /^\d{4}$/.test(yearText) ? parseInt(yearText, 10) : undefined,
            rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
            isMature: true,
            source: 'HentaiMama',
        });
    });

    return out;
}

export function parseLastPage($: CheerioAPI): number {
    let last = 1;
    $('a[href*="/page/"]').each((_, a) => {
        const n = parseInt(($(a).attr('href') ?? '').match(/\/page\/(\d+)/)?.[1] ?? '', 10);
        if (Number.isFinite(n) && n > last) last = n;
    });
    return last;
}

export interface ParsedMamaSeries {
    anime: AnimeBase;
    episodes: Episode[];
}

/** A series page: details plus its own episode list. */
export function parseSeries($: CheerioAPI, slug: string): ParsedMamaSeries | null {
    const title = clean($('h1').first().text()) || clean($('meta[property="og:title"]').attr('content')).replace(/\s*[-–|].*$/, '');
    if (!title) return null;

    const image = absolute($('meta[property="og:image"]').attr('content'));
    const description = clean($('meta[property="og:description"]').attr('content'));
    const genres = [
        ...new Set(
            $('a[href*="/genre/"]')
                .map((_, a) => clean($(a).text()))
                .get()
                .filter((g) => g && g.length < 30)
        ),
    ];
    const rating = parseFloat($('[itemprop="ratingValue"]').attr('content') ?? '');

    // Only this series' own episodes: the page also lists recent episodes of other shows.
    const byNumber = new Map<number, Episode>();
    $('a[href*="/episodes/"]').each((_, a) => {
        const epSlug = ($(a).attr('href') ?? '').match(/\/episodes\/([^/?#]+)/)?.[1];
        const m = epSlug?.match(/^(.*)-episode-(\d+)$/);
        if (!epSlug || !m || m[1] !== slug) return;
        const number = parseInt(m[2], 10);

        // An episode is linked more than once (a text link, a card with its snapshot). The card is
        // lazy-loaded, so `src` may be a placeholder; the still is whichever link carries a real image.
        const img = $(a).find('img').first();
        const raw = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src') || '';
        const thumbnail = raw && !raw.startsWith('data:') ? absolute(raw) : undefined;

        const have = byNumber.get(number);
        if (have) {
            if (!have.thumbnail && thumbnail) have.thumbnail = thumbnail;
            return;
        }
        byNumber.set(number, {
            id: `hentaimama-episodes/${epSlug}`,
            number,
            title: `Episode ${number}`,
            isFiller: false,
            hasSub: true,
            hasDub: false,
            thumbnail,
        });
    });
    const episodes = [...byNumber.values()];
    episodes.sort((a, b) => a.number - b.number);

    const anime: AnimeBase = {
        id: `hentaimama-tvshows/${slug}`,
        title,
        image,
        cover: image || undefined,
        description,
        type: 'OVA',
        status: 'Completed',
        rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
        episodes: episodes.length,
        genres,
        isMature: true,
        source: 'HentaiMama',
    };

    return { anime, episodes };
}

/** `<iframe src="…?dt_embed=hls&p=…&ep=568">` entries from the player AJAX → embed URLs. */
export function parseEmbedUrls(entries: string[]): { kind: string; url: string }[] {
    const out: { kind: string; url: string }[] = [];
    for (const html of entries) {
        const src = html?.match(/src=["']([^"']+)["']/i)?.[1]?.replace(/&#0?38;|&amp;/g, '&');
        if (!src) continue;
        const kind = src.match(/dt_embed=([a-z0-9_]+)/i)?.[1] ?? 'embed';
        out.push({ kind, url: absolute(src) });
    }
    return out;
}

/** The `"file":"…"` an embed page hands its player. */
export function parseEmbedFile(html: string): string | null {
    const m = html.match(/"file"\s*:\s*"([^"]+)"/);
    return m ? m[1].replace(/\\\//g, '/') : null;
}
