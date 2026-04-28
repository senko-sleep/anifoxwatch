/**
 * Mass streaming test — AnimeKai, 50 episodes sequential with rate-limit respect.
 *
 * Run:  npx tsx test-streaming-mass.ts
 *
 * Why sequential?  enc-dec.app (the MegaUp decrypt relay) rate-limits concurrent
 * server-side calls with HTTP 429. Real user traffic is sequential per-session so
 * this test mirrors production load. Concurrency ≤ 2 avoids the limit.
 *
 * Phase 1 — discover 50 episodes across popular titles via AnimeKai search
 * Phase 2 — stream each episode (sub) sequentially, 30 s timeout, 1 s gap
 * Phase 3 — print full report; exit 1 if pass rate < 40%
 */

import { AnimeKaiSource } from './src/sources/animekai-source.js';
import type { Episode } from './src/types/anime.js';

// ─── Config ────────────────────────────────────────────────────────────────

const TARGET_EPISODES   = 50;
const CONCURRENCY       = 2;          // keep under enc-dec.app rate limit
const TIMEOUT_MS        = 30_000;
const DELAY_BETWEEN_MS  = 1_200;      // ~1.2 s gap between requests
const SEARCH_TIMEOUT_MS = 12_000;
const MAX_EPS_PER_ANIME = 3;

// ─── Titles ────────────────────────────────────────────────────────────────

const TITLES: string[] = [
    'One Piece', 'Naruto', 'Death Note', 'Demon Slayer',
    'Attack on Titan', 'My Hero Academia', 'Bleach', 'Jujutsu Kaisen',
    'Sword Art Online', 'Tokyo Ghoul', 'Overlord', 'Re Zero',
    'Fairy Tail', 'One Punch Man', 'Spy x Family', 'Chainsaw Man',
    'Steins Gate', 'Code Geass', 'Fullmetal Alchemist Brotherhood',
    'Hunter x Hunter',
];

// ─── Helpers ───────────────────────────────────────────────────────────────

const G   = '\x1b[32m';
const R   = '\x1b[31m';
const Y   = '\x1b[33m';
const C   = '\x1b[36m';
const B   = '\x1b[1m';
const DIM = '\x1b[2m';
const X   = '\x1b[0m';

const log  = (m: string) => console.log(`${C}[INFO]${X}  ${m}`);
const pass = (m: string) => console.log(`${G}[PASS]${X}  ${m}`);
const fail = (m: string) => console.log(`${R}[FAIL]${X}  ${m}`);
const warn = (m: string) => console.log(`${Y}[WARN]${X}  ${m}`);
const hr   = ()          => console.log(DIM + '─'.repeat(70) + X);

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, rej) =>
            setTimeout(() => rej(new Error(`timeout ${ms}ms — ${label}`)), ms)
        ),
    ]);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface StreamResult {
    episodeId: string;
    title:     string;
    success:   boolean;
    count:     number;
    firstUrl:  string;
    ms:        number;
    error?:    string;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n${B}${C}${'═'.repeat(70)}`);
    console.log(' ANISTREAM HUB — STREAMING TEST (AnimeKai, production-rate)');
    console.log(` Target: ${TARGET_EPISODES} episodes | ${CONCURRENCY} concurrent | ${TIMEOUT_MS / 1000}s timeout`);
    console.log(`${'═'.repeat(70)}${X}\n`);

    const kai = new AnimeKaiSource();

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE 1 — Discover episodes
    // ══════════════════════════════════════════════════════════════════════

    console.log(`${B}Phase 1: Discover episodes${X}\n`);

    interface WorkItem { episodeId: string; title: string }
    const queue: WorkItem[] = [];
    const seenEps = new Set<string>();

    for (const title of TITLES) {
        if (queue.length >= TARGET_EPISODES) break;
        try {
            const sr = await withTimeout(
                kai.search(title, 1, undefined, { timeout: SEARCH_TIMEOUT_MS }),
                SEARCH_TIMEOUT_MS, `search:${title}`,
            );
            if (!sr.results.length) { warn(`No results: "${title}"`); continue; }

            const animeId = sr.results[0].id;
            const eps: Episode[] = await withTimeout(
                kai.getEpisodes(animeId, { timeout: SEARCH_TIMEOUT_MS }),
                SEARCH_TIMEOUT_MS, `eps:${animeId}`,
            );
            if (!eps.length) { warn(`No episodes: "${title}"`); continue; }

            let added = 0;
            for (const ep of eps.slice(0, MAX_EPS_PER_ANIME)) {
                if (seenEps.has(ep.id)) continue;
                seenEps.add(ep.id);
                queue.push({ episodeId: ep.id, title });
                added++;
            }
            log(`"${title}" — ${eps.length} eps, +${added} → ${queue.length} queued`);
        } catch (e: unknown) {
            warn(`Discovery failed "${title}": ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    hr();
    log(`Queue: ${queue.length} episodes`);
    hr();

    if (!queue.length) {
        fail('No episodes discovered — AnimeKai unreachable?');
        process.exit(1);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE 2 — Stream all (with rate-limit-friendly pacing)
    // ══════════════════════════════════════════════════════════════════════

    const sliced = queue.slice(0, TARGET_EPISODES);
    console.log(`\n${B}Phase 2: Streaming ${sliced.length} episodes (${CONCURRENCY} concurrent, ${DELAY_BETWEEN_MS}ms gap)${X}\n`);

    const results: StreamResult[] = [];
    let active = 0;

    // Simple semaphore-based pool
    const runOne = async (item: WorkItem): Promise<StreamResult> => {
        const t0 = Date.now();
        try {
            const data = await withTimeout(
                kai.getStreamingLinks(item.episodeId, undefined, 'sub', { timeout: TIMEOUT_MS }),
                TIMEOUT_MS, `stream:${item.episodeId}`,
            );
            const ms = Date.now() - t0;
            const ok = data.sources.length > 0;
            const mark = ok ? `${G}✓${X}` : `${R}✗${X}`;
            const url = data.sources[0]?.url ?? '';
            console.log(`  ${mark} [${results.length + active}/${sliced.length}] ${item.title} — ${data.sources.length} src | ${ms}ms${ok ? ` | ${DIM}${url.substring(0, 55)}…${X}` : ''}`);
            return { episodeId: item.episodeId, title: item.title, success: ok, count: data.sources.length, firstUrl: url, ms };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.log(`  ${R}✗${X} [${results.length + active}/${sliced.length}] ${item.title} — ${msg}`);
            return { episodeId: item.episodeId, title: item.title, success: false, count: 0, firstUrl: '', ms: Date.now() - t0, error: msg };
        }
    };

    // Process with concurrency cap + delay
    const pending: Promise<void>[] = [];
    for (const item of sliced) {
        while (active >= CONCURRENCY) await Promise.race(pending);
        active++;
        const p = runOne(item).then(r => {
            results.push(r);
            active--;
        });
        pending.push(p);
        // Remove settled promises from pending list
        for (let i = pending.length - 1; i >= 0; i--) {
            pending[i].then(() => pending.splice(i, 1)).catch(() => pending.splice(i, 1));
        }
        await sleep(DELAY_BETWEEN_MS);
    }
    await Promise.all(pending);

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE 3 — Report
    // ══════════════════════════════════════════════════════════════════════

    const passing = results.filter(r => r.success);
    const failing = results.filter(r => !r.success);
    const pct     = results.length ? ((passing.length / results.length) * 100).toFixed(1) : '0';
    const avgMs   = results.length
        ? (results.reduce((a, r) => a + r.ms, 0) / results.length).toFixed(0) : '0';

    hr();
    if (failing.length) {
        console.log(`\n${B}${R}Failures (${failing.length}):${X}`);
        const groups = new Map<string, number>();
        for (const r of failing) {
            const key = (r.error ?? 'no sources returned').slice(0, 90);
            groups.set(key, (groups.get(key) ?? 0) + 1);
        }
        for (const [msg, n] of [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10))
            console.log(`  ${R}✗ ×${n}${X}  ${msg}`);
    }

    console.log(`\n${B}${'═'.repeat(70)}`);
    console.log(' SUMMARY');
    console.log('═'.repeat(70) + X);
    console.log(`  Source         : AnimeKai (MegaUp CDN via enc-dec.app)`);
    console.log(`  Total tested   : ${results.length}`);
    console.log(`  ${G}Passing${X}        : ${passing.length}  (${pct}%)`);
    console.log(`  ${R}Failing${X}        : ${failing.length}`);
    console.log(`  Avg latency    : ${avgMs} ms`);
    console.log(`${B}${'═'.repeat(70)}${X}\n`);

    if (passing.length === 0) {
        fail('STREAMING BROKEN — zero working streams');
        process.exit(1);
    } else if (parseFloat(pct) < 40) {
        warn(`LOW SUCCESS RATE (${pct}%) — streaming may be degraded`);
        process.exit(1);
    } else {
        pass(`Streaming working: ${passing.length}/${results.length} (${pct}%)`);
    }
}

main().catch(err => {
    fail(`Fatal: ${(err as Error).message}`);
    console.error((err as Error).stack ?? err);
    process.exit(1);
});
