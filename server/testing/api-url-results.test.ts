import { describe, it, expect } from 'vitest';
import { buildApiTestRequestUrls } from './api-url-results';

describe('buildApiTestRequestUrls', () => {
    it('lists every probe with full request URLs (no truncation)', () => {
        const base = 'https://anifoxwatch.vercel.app';
        const rows = buildApiTestRequestUrls(base);

        const byName = Object.fromEntries(rows.map((r) => [r.name, r.requestUrl]));

        expect(byName.health).toBe('https://anifoxwatch.vercel.app/health');
        expect(byName.api_health).toBe('https://anifoxwatch.vercel.app/api/health');
        expect(byName.anime_search_hianime).toBe(
            'https://anifoxwatch.vercel.app/api/anime/search?q=one%20piece&page=1&source=hianime'
        );

        const watch = new URL(byName.stream_watch_steinsgate);
        expect(watch.origin + watch.pathname).toBe(
            'https://anifoxwatch.vercel.app/api/stream/watch/steinsgate-3'
        );
        expect(watch.searchParams.get('ep')).toBe('230');
        expect(watch.searchParams.get('category')).toBe('sub');

        const proxy = new URL(byName.hianime_rest_sources);
        expect(proxy.pathname).toBe('/api/hianime-rest/episode/sources');
        expect(proxy.searchParams.get('animeEpisodeId')).toBe('steinsgate-3?ep=230');
        expect(proxy.searchParams.get('server')).toBe('megacloud');
        expect(proxy.searchParams.get('category')).toBe('sub');
    });

    it('strips trailing slash from base', () => {
        const rows = buildApiTestRequestUrls('https://example.com/');
        expect(rows[0].requestUrl).toBe('https://example.com/health');
    });
});
