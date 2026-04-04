/**
 * End-to-end Cloud Run smoke test — covers health, search, and streaming.
 *
 * Run locally against a deployed service:
 *   API_URL=https://your-service-url.run.app npx tsx testing/test-cloudrun.ts
 *
 * Or against localhost for local docker testing:
 *   API_URL=http://localhost:8080 npx tsx testing/test-cloudrun.ts
 */

const BASE = (process.env.API_URL ?? 'http://localhost:8080').replace(/\/$/, '');

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

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testHealth() {
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
    // Step 1: search for a known anime to get an episode ID
    await check('Streaming – find episode ID for "One Piece"', async () => {
        const search = await fetchJSON('/api/anime/search?q=one+piece&page=1', 30000);
        const first = search.results?.[0];
        if (!first) throw new Error('no search results');
        return `id=${first.id}, title=${first.title}`;
    });

    // Step 2: use a known HiAnime episode slug for streaming test
    const testEpisodeId = 'one-piece-100?ep=2142';
    await check(`Streaming – GET /api/stream/servers/${testEpisodeId}`, async () => {
        const data = await fetchJSON(`/api/stream/servers/${encodeURIComponent(testEpisodeId)}`, 30000);
        const serverCount = data.servers?.length ?? 0;
        if (serverCount === 0) throw new Error('no servers returned');
        return `${serverCount} servers available`;
    });

    await check(`Streaming – GET /api/stream/watch/${testEpisodeId}`, async () => {
        const data = await fetchJSON(`/api/stream/watch/${encodeURIComponent(testEpisodeId)}`, 30000);
        const hasSources = Array.isArray(data.sources) && data.sources.length > 0;
        const hasM3u8 = data.sources?.some((s: any) =>
            typeof s.url === 'string' && (s.url.includes('.m3u8') || s.url.includes('http'))
        );
        if (!hasSources) throw new Error('no stream sources');
        return `${data.sources.length} sources, m3u8=${hasM3u8}`;
    });
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\nAniStream Cloud Run E2E Test`);
    console.log(`Target: ${BASE}\n`);

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
