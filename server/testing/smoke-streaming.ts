/**
 * Smoke test for deployed API: health + anime search + stream watch + HiAnime REST proxy.
 *
 * Usage (from repo root or server/):
 *   STREAM_TEST_BASE=https://your-app.vercel.app npx tsx server/testing/smoke-streaming.ts
 *
 * If STREAM_TEST_BASE is omitted, reads VITE_API_URL from ../../.env.production
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadBaseFromEnvFile(): string {
    const candidates = [
        join(__dirname, '../../.env.production'),
        join(__dirname, '../.env.production'),
    ];
    for (const p of candidates) {
        if (!existsSync(p)) continue;
        const text = readFileSync(p, 'utf-8');
        const m = text.match(/^\s*VITE_API_URL\s*=\s*(\S+)/m);
        if (m?.[1]) return m[1].trim().replace(/\/$/, '');
    }
    return '';
}

async function get(
    url: string,
    init?: RequestInit
): Promise<{ ok: boolean; status: number; snippet: string; body: string }> {
    const res = await fetch(url, {
        ...init,
        headers: { Accept: 'application/json', ...init?.headers },
        signal: AbortSignal.timeout(25_000),
    });
    const text = await res.text();
    const snippet = text.length > 280 ? `${text.slice(0, 280)}…` : text;
    return { ok: res.ok, status: res.status, snippet, body: text };
}

async function main() {
    const base =
        (process.env.STREAM_TEST_BASE || process.argv[2] || '').replace(/\/$/, '') ||
        loadBaseFromEnvFile();

    if (!base) {
        console.error(
            'Set STREAM_TEST_BASE or pass URL as argv[1], or add VITE_API_URL to .env.production'
        );
        process.exit(1);
    }

    console.log(`\nStreaming smoke test → ${base}\n`);

    /** Edge scraping often works locally but not on Vercel serverless; require stream 200 only on localhost or SMOKE_REQUIRE_STREAM=1 */
    const streamSourcesCritical =
        process.env.SMOKE_REQUIRE_STREAM === '1' ||
        /localhost|127\.0\.0\.1/.test(base);

    const rows: { step: string; ok: boolean; status: number; detail: string; critical?: boolean }[] =
        [];

    let r = await get(`${base}/health`);
    rows.push({
        step: 'GET /health',
        ok: r.ok,
        status: r.status,
        detail: r.snippet,
        critical: true,
    });

    r = await get(`${base}/api/health`);
    rows.push({
        step: 'GET /api/health',
        ok: r.ok,
        status: r.status,
        detail: r.snippet,
        critical: true,
    });

    r = await get(
        `${base}/api/anime/search?q=one%20piece&page=1&source=hianime`
    );
    rows.push({
        step: 'GET /api/anime/search (sanity)',
        ok: r.ok,
        status: r.status,
        detail: r.ok ? 'JSON received' : r.snippet,
        critical: true,
    });

    // Same shape as server/aniwatch-api __tests__/animeEpisodeSrcs — reliable on Vercel (cross-source / REST).
    const watchUrl = new URL(`${base}/api/stream/watch/steinsgate-3`);
    watchUrl.searchParams.set('ep', '230');
    watchUrl.searchParams.set('category', 'sub');
    r = await get(watchUrl.toString());
    rows.push({
        step: 'GET /api/stream/watch (sample HiAnime id)',
        ok: r.ok,
        status: r.status,
        detail: r.ok ? 'has sources' : r.snippet,
        critical: streamSourcesCritical,
    });

    const proxyUrl = new URL(`${base}/api/hianime-rest/episode/sources`);
    proxyUrl.searchParams.set('animeEpisodeId', 'steinsgate-3?ep=230');
    proxyUrl.searchParams.set('server', 'megacloud');
    proxyUrl.searchParams.set('category', 'sub');
    r = await get(proxyUrl.toString());
    rows.push({
        step: 'GET /api/hianime-rest/episode/sources (proxy → HIANIME_REST_URL)',
        ok: r.status === 200,
        status: r.status,
        critical: false,
        detail:
            r.status === 503
                ? 'Set HIANIME_REST_URL on the API host (e.g. Vercel env)'
                : r.status === 404
                  ? 'Upstream aniwatch-api returned 404 (scraper); optional check'
                  : r.snippet,
    });

    // Frieren S2 ep 1 — HiAnime-style ID that requires anilist_id + ep_num for AnimeFLV fallback
    const frierenUrl = new URL(`${base}/api/stream/watch/frieren-beyond-journeys-end-season-2-20409`);
    frierenUrl.searchParams.set('ep', '163517');
    frierenUrl.searchParams.set('category', 'sub');
    frierenUrl.searchParams.set('ep_num', '1');
    frierenUrl.searchParams.set('anilist_id', '182255');
    r = await get(frierenUrl.toString());
    {
        let sourcesCount = 0;
        try { sourcesCount = JSON.parse(r.body ?? '{}').sources?.length ?? 0; } catch { /* */ }
        rows.push({
            step: 'GET /api/stream/watch (Frieren S2 ep 1, anilist fallback)',
            ok: r.ok && sourcesCount > 0,
            status: r.status,
            critical: true,
            detail: r.ok && sourcesCount > 0 ? `${sourcesCount} source(s)` : r.snippet,
        });
    }

    // Extra stream probes (optional) — tests AnimeFLV coverage for additional anime
    const extraStreams: Array<{ label: string; path: string; ep: string }> = [
        { label: 'Attack on Titan ep 1',        path: 'shingeki-no-kyojin-1',  ep: '1'   },
        { label: 'Death Note ep 1',              path: 'death-note-1',          ep: '1'   },
        { label: 'Naruto ep 1',                  path: 'naruto-1',              ep: '1'   },
    ];
    for (const probe of extraStreams) {
        const u = new URL(`${base}/api/stream/watch/${probe.path}`);
        u.searchParams.set('ep_num', probe.ep);
        u.searchParams.set('category', 'sub');
        const res = await get(u.toString());
        let sourcesCount = 0;
        try { sourcesCount = JSON.parse(res.body ?? '{}').sources?.length ?? 0; } catch { /* */ }
        rows.push({
            step: `GET /api/stream/watch (${probe.label})`,
            ok: res.ok && sourcesCount > 0,
            status: res.status,
            critical: false,
            detail: res.ok ? `${sourcesCount} source(s)` : res.snippet,
        });
    }

    // Monitoring route
    r = await get(`${base}/api/monitoring/verification`);
    rows.push({
        step: 'GET /api/monitoring/verification',
        ok: r.status === 200,
        status: r.status,
        critical: false,
        detail: r.ok ? 'OK' : r.snippet,
    });

    let failedCritical = 0;
    for (const row of rows) {
        const mark = row.ok ? '✓' : '✗';
        const tag = row.critical === false ? ' (optional)' : '';
        console.log(`${mark} ${row.step} → HTTP ${row.status}${tag}`);
        if (!row.ok) {
            console.log(`   ${row.detail}`);
            if (row.critical !== false) failedCritical++;
        }
    }

    console.log('');
    if (failedCritical > 0) {
        console.error(
            `Done: ${failedCritical} critical step(s) failed. Check STREAM_TEST_BASE, API, and sources.`
        );
        process.exit(1);
    }
    console.log('Done: critical streaming checks passed.');
    const streamRow = rows.find((x) => x.step.includes('/api/stream/watch'));
    if (streamRow && !streamRow.ok && !streamSourcesCritical) {
        console.log(
            '(Stream endpoint returned non-OK — common on Vercel serverless; the SPA uses /api/hianime-rest fallback. Use localhost or SMOKE_REQUIRE_STREAM=1 to require sources here.)'
        );
    }
    const proxy = rows.find((x) => x.step.includes('hianime-rest'));
    if (proxy && !proxy.ok) {
        if (proxy.status === 503) {
            console.log('(HiAnime REST proxy: add HIANIME_REST_URL in Vercel project → Environment Variables.)');
        } else if (proxy.status === 404) {
            console.log('(HiAnime REST proxy reached upstream; 404 = aniwatch-api scraper / episode — not your proxy route.)');
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
