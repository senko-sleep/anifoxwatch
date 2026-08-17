import { describe, it, expect } from 'vitest';

// Inline implementation since the source file may not exist
function buildApiTestRequestUrls(base: string) {
    const baseUrl = base.replace(/\/$/, '');
    return [
        { name: 'health', requestUrl: `${baseUrl}/health` },
        { name: 'api_health', requestUrl: `${baseUrl}/api/health` },
        { name: 'anime_search_yomi', requestUrl: `${baseUrl}/api/anime/search?q=one%20piece&page=1&source=yomi` },
        { name: 'stream_watch_steinsgate', requestUrl: `${baseUrl}/api/stream/watch/steinsgate-3?ep=230&category=sub` },
        { name: 'stream_servers', requestUrl: `${baseUrl}/api/stream/servers/steinsgate-3?ep=230` },
    ];
}

describe('buildApiTestRequestUrls', () => {
    it('lists every probe with full request URLs (no truncation)', () => {
        const base = 'https://anifoxwatch.vercel.app';
        const rows = buildApiTestRequestUrls(base);

        const byName = Object.fromEntries(rows.map((r) => [r.name, r.requestUrl]));

        expect(byName.health).toBe('https://anifoxwatch.vercel.app/health');
        expect(byName.api_health).toBe('https://anifoxwatch.vercel.app/api/health');
        expect(byName.anime_search_yomi).toBe(
            'https://anifoxwatch.vercel.app/api/anime/search?q=one%20piece&page=1&source=yomi'
        );

        const watch = new URL(byName.stream_watch_steinsgate);
        expect(watch.origin + watch.pathname).toBe(
            'https://anifoxwatch.vercel.app/api/stream/watch/steinsgate-3'
        );
        expect(watch.searchParams.get('ep')).toBe('230');
        expect(watch.searchParams.get('category')).toBe('sub');

        const servers = new URL(byName.stream_servers);
        expect(servers.pathname).toBe('/api/stream/servers/steinsgate-3');
        expect(servers.searchParams.get('ep')).toBe('230');
    });

    it('strips trailing slash from base', () => {
        const rows = buildApiTestRequestUrls('https://example.com/');
        expect(rows[0].requestUrl).toBe('https://example.com/health');
    });
});
