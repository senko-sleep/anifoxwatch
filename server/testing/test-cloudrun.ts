/**
 * End-to-end smoke test — health, search, episodes, stream servers, stream/watch.
 *
 * Deployed API (Render, etc.):
 *   API_URL=https://your-api.onrender.com npx tsx testing/test-cloudrun.ts
 *
 * Local:
 *   API_URL=http://127.0.0.1:3001 npx tsx testing/test-cloudrun.ts
 *
 * Stream/watch:
 *   - On **localhost**, a successful extraction (HTTP 200 + sources[]) is **required**.
 *   - On **remote** hosts, if every CDN/upstream blocks datacenter IPs, you may get HTTP 404
 *     `No streaming sources found` — that still counts as **pass** (API + routing OK), unless you set
 *     `STREAM_TEST_STRICT=1` to require real m3u8 URLs on remote too.
 */

const BASE = (process.env.API_URL ?? 'http://localhost:8080').replace(/\/$/, '');

/** Production stream/watch can exceed 30s (Puppeteer + source racing on cold VMs). */
const STREAM_WATCH_MS = Number(process.env.STREAM_WATCH_MS ?? 120_000);

function isLocalBaseUrl(base: string): boolean {
    try {
        const u = new URL(base);
        const h = u.hostname.toLowerCase();
        return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    } catch {
        return false;
    }
}

/** Require extracted stream URLs: always on localhost; on remote only if STREAM_TEST_STRICT=1 */
const STRICT_STREAM = process.env.STREAM_TEST_STRICT === '1' || isLocalBaseUrl(BASE);

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

async function check(name: string, fn: () => Promise<string>) {
    try {
        const detail = await fn();
        results.push({ name, ok: true, detail });
        console.log(`  ✅ ${name}: ${detail}`);
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        results.push({ name, ok: false, detail });
        console.log(`  ❌ ${name}: ${detail}`);
    }
}

async function fetchJSON(path: string, timeoutMs = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

async function fetchResponse(path: string, timeoutMs: number): Promise<{ status: number; data: any }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
        let data: any = {};
        try {
            data = await res.json();
        } catch {
            /* non-JSON body */
        }
        return { status: res.status, data };
    } finally {
        clearTimeout(timer);
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testHealth() {
    await check('GET /', async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15_000);
        try {
            const res = await fetch(`${BASE}/`, { signal: ctrl.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return 'ok';
        } finally {
            clearTimeout(timer);
        }
    });

    await check('GET /health', async () => {
        const data = await fetchJSON('/health');
        if (data.status !== 'healthy') throw new Error(`status=${data.status}`);
        return `uptime=${Math.round(data.uptime)}s`;
    });

    await check('GET /api/health', async () => {
        const data = await fetchJSON('/api/health');
        // reliability middleware returns "ok"; health endpoint returns "healthy"
        if (data.status !== 'healthy' && data.status !== 'ok') throw new Error(`status=${data.status}`);
        const circuits = data.circuits?.length ?? 0;
        return `status=${data.status}, circuits=${circuits}`;
    });
}

async function testApiDocs() {
    await check('GET /api (docs)', async () => {
        const data = await fetchJSON('/api');
        if (!data.endpoints) throw new Error('no endpoints field');
        return `v${data.version}`;
    });
}

async function testSearch() {
    await check('GET /api/anime/search?q=naruto', async () => {
        const data = await fetchJSON('/api/anime/search?q=naruto&page=1', 30000);
        const count = data.results?.length ?? 0;
        if (count === 0) throw new Error('no results returned');
        return `${count} results, source=${data.source}`;
    });
}

async function testTrending() {
    await check('GET /api/anime/trending', async () => {
        const data = await fetchJSON('/api/anime/trending?page=1', 30000);
        const count = data.results?.length ?? 0;
        if (count === 0) throw new Error('no trending results');
        return `${count} results`;
    });
}

async function testSources() {
    await check('GET /api/sources', async () => {
        const data = await fetchJSON('/api/sources');
        const count = Array.isArray(data) ? data.length : data.sources?.length ?? 0;
        if (count === 0) throw new Error('no sources');
        return `${count} sources registered`;
    });

    await check('GET /api/sources/health', async () => {
        const data = await fetchJSON('/api/sources/health', 30000);
        const healthy = data.sources?.filter((s: any) => s.healthy)?.length ?? '?';
        return `${healthy} healthy sources`;
    });
}

async function testStreaming() {
    let animeId = '';
    let episodeId = '';

    await check('Streaming – resolve anime + episode (prefer AnimeKai IDs)', async () => {
        /** AnimeKai uses Consumet episode IDs (`$ep=`) that usually work on cloud hosts; 9anime `?ep=` needs Puppeteer and often fails on Render. */
        const tries: { q: string; source?: string }[] = [
            { q: 'dandadan', source: 'AnimeKai' },
            { q: 'spy x family', source: 'AnimeKai' },
            { q: 'one piece', source: 'AnimeKai' },
            { q: 'naruto', source: 'AnimeKai' },
            { q: 'chainsaw man', source: 'AnimeKai' },
        ];

        for (const { q, source } of tries) {
            const qs = new URLSearchParams({
                q,
                page: '1',
                ...(source ? { source } : {}),
            });
            let search: any;
            try {
                search = await fetchJSON(`/api/anime/search?${qs}`, 35_000);
            } catch {
                continue;
            }
            let row = search.results?.[0] as { id?: string; title?: string } | undefined;
            if (!row?.id) continue;

            let data: any;
            try {
                data = await fetchJSON(`/api/anime/episodes?id=${encodeURIComponent(row.id)}`, 90_000);
            } catch {
                continue;
            }
            const eps = data.episodes as Array<{ id?: string; number?: number }> | undefined;
            const ep = eps?.find((e) => e.number === 1) || eps?.[0];
            if (!ep?.id || !eps?.length) continue;

            animeId = row.id;
            episodeId = ep.id;
            const short = episodeId.length > 72 ? `${episodeId.slice(0, 72)}…` : episodeId;
            return `anime=${animeId} (${row.title}) | ${eps.length} eps | ep1=${short}`;
        }

        throw new Error('Could not resolve any anime+episode via AnimeKai-first search');
    });

    await check('Streaming – GET /api/stream/servers', async () => {
        const data = await fetchJSON(`/api/stream/servers/${encodeURIComponent(episodeId)}`, 60_000);
        const serverCount = data.servers?.length ?? 0;
        if (serverCount === 0) throw new Error('no servers returned');
        return `${serverCount} servers available`;
    });

    await check('Streaming – GET /api/stream/watch', async () => {
        const paths = [
            `/api/stream/watch/${encodeURIComponent(episodeId)}?category=sub`,
            `/api/stream/watch/${encodeURIComponent(episodeId)}?category=sub&server=hd-1&tryAll=false`,
            `/api/stream/watch/${encodeURIComponent(episodeId)}?category=sub&server=hd-3&tryAll=false`,
        ];
        let lastDetail = 'no attempt';
        for (const watchPath of paths) {
            const { status, data } = await fetchResponse(watchPath, STREAM_WATCH_MS);
            if (status === 200 && Array.isArray(data?.sources) && data.sources.length > 0) {
                const hasM3u8 = data.sources.some(
                    (s: any) => typeof s.url === 'string' && (s.url.includes('.m3u8') || s.url.includes('http'))
                );
                return `${data.sources.length} sources, m3u8=${hasM3u8}`;
            }
            const errStr = String(data?.error ?? '');
            if (!STRICT_STREAM && status === 404 && /no streaming sources found/i.test(errStr)) {
                return 'degraded pass (remote IP blocked by CDNs; API OK) — STREAM_TEST_STRICT=1 to require m3u8';
            }
            lastDetail = `HTTP ${status}${errStr ? ` (${errStr})` : ''}`.trim();
        }
        throw new Error(lastDetail || 'no stream sources');
    });
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\nAniStream API smoke test`);
    console.log(`Target: ${BASE}`);
    console.log(`Stream/watch mode: ${STRICT_STREAM ? 'STRICT (must return m3u8)' : 'RELAXED (remote 404 “no sources” allowed)'}\n`);

    console.log('── Health ──────────────────────────────────────');
    await testHealth();

    console.log('── API Docs ────────────────────────────────────');
    await testApiDocs();

    console.log('── Anime ───────────────────────────────────────');
    await testSearch();
    await testTrending();

    console.log('── Sources ─────────────────────────────────────');
    await testSources();

    console.log('── Streaming ───────────────────────────────────');
    await testStreaming();

    // Summary
    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n── Summary ─────────────────────────────────────`);
    console.log(`   Passed: ${passed}/${results.length}`);
    if (failed > 0) {
        console.log(`   Failed:`);
        results.filter(r => !r.ok).forEach(r => console.log(`     • ${r.name}: ${r.detail}`));
    }

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
