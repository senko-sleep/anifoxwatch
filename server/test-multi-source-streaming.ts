/**
 * Multi-show streaming test — verifies at least one source returns streams for
 * 10 different anime spanning new seasons, classics, dub-only, and movies.
 *
 * Usage:
 *   npx tsx server/test-multi-source-streaming.ts                    # local
 *   API_BASE=https://anifoxwatch-ci33.onrender.com npx tsx ...       # Render
 *   API_BASE=https://anifoxwatch.vercel.app npx tsx ...              # Vercel
 */

const BASE = process.env.API_BASE ?? 'http://localhost:3001';
const TIMEOUT = parseInt(process.env.TIMEOUT_MS ?? '40000', 10);

interface TestCase {
    label: string;
    slug: string;
    token: string;
    epNum: number;
    anilistId: number;
    category?: 'sub' | 'dub';
}

const TEST_CASES: TestCase[] = [
    // ── Currently airing ──────────────────────────────────────────────────────
    {
        label: 'Re:Zero S4 ep1 sub',
        slug: 'rezero-kara-hajimeru-isekai-seikatsu-4th-season-8lj0',
        token: 'Ltfh8KXzuwau03VfhY-G',
        epNum: 1, anilistId: 189046,
    },
    {
        label: 'Witch Hat Atelier ep1 sub',
        slug: 'witch-hat-atelier-3e32',
        token: 'e4WzpOzxuw3viW9fiozb',
        epNum: 1, anilistId: 147105,
    },
    // ── Long-running (AllAnime coverage) ─────────────────────────────────────
    {
        label: 'One Piece ep1 sub',
        slug: 'one-piece-100',
        token: 'placeholder',   // server resolves via AllAnime title search
        epNum: 1, anilistId: 21,
    },
    {
        label: 'Naruto Shippuden ep1 sub',
        slug: 'naruto-shippuden-dz4',
        token: 'placeholder',
        epNum: 1, anilistId: 1735,
    },
    // ── Classic completed ─────────────────────────────────────────────────────
    {
        label: 'Attack on Titan ep1 sub',
        slug: 'shingeki-no-kyojin-m6gy',
        token: 'placeholder',
        epNum: 1, anilistId: 16498,
    },
    {
        label: 'Demon Slayer ep1 sub',
        slug: 'kimetsu-no-yaiba-4mpg',
        token: 'placeholder',
        epNum: 1, anilistId: 101922,
    },
    // ── Dub tests ─────────────────────────────────────────────────────────────
    {
        label: 'One Piece ep1 DUB',
        slug: 'one-piece-100',
        token: 'placeholder',
        epNum: 1, anilistId: 21, category: 'dub',
    },
    {
        label: 'Demon Slayer ep1 DUB',
        slug: 'kimetsu-no-yaiba-4mpg',
        token: 'placeholder',
        epNum: 1, anilistId: 101922, category: 'dub',
    },
    // ── Popular recent ────────────────────────────────────────────────────────
    {
        label: 'Jujutsu Kaisen ep1 sub',
        slug: 'jujutsu-kaisen-gge4',
        token: 'placeholder',
        epNum: 1, anilistId: 113415,
    },
    {
        label: 'Frieren ep1 sub',
        slug: 'sousou-no-frieren-bx1k',
        token: 'placeholder',
        epNum: 1, anilistId: 154587,
    },
];

interface Result {
    label: string;
    ok: boolean;
    statusCode: number;
    sources: number;
    sourceType: string;
    firstUrl: string;
    ms: number;
    error?: string;
}

async function runCase(tc: TestCase): Promise<Result> {
    const cat = tc.category ?? 'sub';
    const url = new URL(`/api/stream/watch/${tc.slug}`, BASE);

    // For placeholder tokens, skip the token — server uses AllAnime title fallback via anilistId
    if (tc.token !== 'placeholder') {
        url.searchParams.set('ep', tc.token);
    }
    url.searchParams.set('ep_num', String(tc.epNum));
    url.searchParams.set('category', cat);
    url.searchParams.set('anilist_id', String(tc.anilistId));

    const start = Date.now();
    try {
        const resp = await fetch(url.toString(), {
            signal: AbortSignal.timeout(TIMEOUT),
        });
        const ms = Date.now() - start;
        const body = await resp.json() as any;

        if (resp.ok && body?.sources?.length) {
            const embedCount = body.sources.filter((s: any) => s.isEmbed).length;
            const hlsCount = body.sources.filter((s: any) => s.isM3U8 && !s.isEmbed).length;
            const sourceType = embedCount > 0 && hlsCount === 0 ? 'embed' : hlsCount > 0 ? 'hls' : 'direct';
            return {
                label: tc.label, ok: true, statusCode: resp.status,
                sources: body.sources.length, sourceType,
                firstUrl: body.sources[0]?.url?.substring(0, 70) ?? '',
                ms,
            };
        }
        return {
            label: tc.label, ok: false, statusCode: resp.status,
            sources: 0, sourceType: 'none', firstUrl: '',
            ms, error: body?.error ?? 'no sources',
        };
    } catch (e: unknown) {
        return {
            label: tc.label, ok: false, statusCode: 0,
            sources: 0, sourceType: 'none', firstUrl: '',
            ms: Date.now() - start, error: (e instanceof Error) ? e.message : String(e),
        };
    }
}

async function main() {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Streaming test  →  ${BASE}`);
    console.log(`Timeout: ${TIMEOUT}ms per case`);
    console.log(`${'═'.repeat(60)}\n`);

    // Run all cases concurrently
    const results = await Promise.all(TEST_CASES.map(runCase));

    let passed = 0, failed = 0, embedOnly = 0;
    for (const r of results) {
        const icon = r.ok ? '✅' : '❌';
        const typeLabel = r.ok ? ` [${r.sourceType}]` : '';
        const detail = r.ok
            ? `${r.sources} source(s) in ${r.ms}ms${typeLabel}`
            : `${r.statusCode || 'ERR'} — ${r.error}`;
        console.log(`${icon} ${r.label.padEnd(35)} ${detail}`);
        if (r.ok) {
            passed++;
            if (r.sourceType === 'embed') embedOnly++;
        } else {
            failed++;
        }
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Results: ${passed} passed, ${failed} failed  (${embedOnly} embed-only)`);
    if (embedOnly > 0) {
        console.log(`  ⚠️  ${embedOnly} show(s) got iframe embeds instead of direct HLS`);
        console.log(`     (embeds play in browser but can't be proxied server-side)`);
    }
    console.log(`${'═'.repeat(60)}\n`);

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
