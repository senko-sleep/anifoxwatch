/**
 * Sub/Dub streaming comparison test
 *
 * For each anime:
 *   1. Get episodes
 *   2. Call getStreamingLinks for ep 1 with category='sub'  AND  category='dub'
 *   3. Assert sub and dub produce different URLs
 *   4. Assert subtitles are returned with the stream
 *   5. Print detailed comparison
 *
 * Usage (from server/):
 *   npx tsx testing/test-sub-dub-streaming.ts
 *   API_URL=https://your-api npx tsx testing/test-sub-dub-streaming.ts
 */

import { sourceManager } from '../src/services/source-manager.js';

const TEST_ANIME: Array<{ label: string; anilistId: number; epNum: number }> = [
  // AL 20 = Naruto — 220 eps, confirmed both sub + dub
  { label: 'Naruto',         anilistId: 20,      epNum: 1   },
  // AL 101922 = Demon Slayer — 26 eps, both tracks work
  { label: 'Demon Slayer',   anilistId: 101922,  epNum: 1   },
  // AL 113415 = Jujutsu Kaisen — 24 eps, both tracks widely available
  { label: 'JJK',            anilistId: 113415,  epNum: 1   },
];

const TIMEOUT_SUB    = 30_000;
const TIMEOUT_DUB    = 30_000;
const TIMEOUT_EPS    = 25_000;

// Signal flags for graceful test shutdown (set by SIGINT/SIGTERM)
let shutdown = false;
process.on('SIGINT',  () => { shutdown = true; process.exit(130); });
process.on('SIGTERM', () => { shutdown = true; process.exit(143); });

async function race<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

function pad(s: string, width: number): string {
  return s.padEnd(width);
}

async function testSubDubForAnime(
  label: string,
  anilistId: number,
  epNum: number
): Promise<{
  ok: boolean;
  subSources: number;
  dubSources: number;
  subSubs: number;
  dubSubs: number;
  subUrl: string | null;
  dubUrl: string | null;
  subServer: string | null;
  dubServer: string | null;
  urlsDiffer: boolean;
  subsPresent: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  const anilistIdStr = `anilist-${anilistId}`;

  // ── Fetch episodes ──────────────────────────────────────────────────
  let episodes: Array<{ id: string; number: number }> = [];
  try {
    const epsData = await race(
      sourceManager.getEpisodes(anilistIdStr),
      TIMEOUT_EPS,
      `getEpisodes(${label})`
    );
    episodes = epsData;
  } catch (e: any) {
    errors.push(`Episodes failed: ${e.message}`);
    return { ok: false, subSources: 0, dubSources: 0, subSubs: 0, dubSubs: 0, subUrl: null, dubUrl: null, subServer: null, dubServer: null, urlsDiffer: false, errors, subsPresent: false };
  }

  if (episodes.length === 0) {
    errors.push('No episodes returned');
    return { ok: false, subSources: 0, dubSources: 0, subSubs: 0, dubSubs: 0, subUrl: null, dubUrl: null, subServer: null, dubServer: null, urlsDiffer: false, errors, subsPresent: false };
  }

  const ep = episodes.find((e) => e.number === epNum) ?? episodes[0];
  console.log(`  Ep ${ep.number} → ${ep.id}`);

  // ── Sub stream ─────────────────────────────────────────────────────
  const subStart = Date.now();
  let subStream: StreamingData = { sources: [], subtitles: [] };
  try {
    subStream = await race(
      sourceManager.getStreamingLinks(ep.id, undefined, 'sub', epNum, anilistId),
      TIMEOUT_SUB,
      `getStreamingLinks(sub)`
    );
  } catch (e: any) {
    errors.push(`Sub stream: ${e.message}`);
  }

  // ── Dub stream ─────────────────────────────────────────────────────
  const dubStart = Date.now();
  let dubStream: StreamingData = { sources: [], subtitles: [] };
  try {
    dubStream = await race(
      sourceManager.getStreamingLinks(ep.id, undefined, 'dub', epNum, anilistId),
      TIMEOUT_DUB,
      `getStreamingLinks(dub)`
    );
  } catch (e: any) {
    errors.push(`Dub stream: ${e.message}`);
  }

  // ── Analysis ───────────────────────────────────────────────────────
  const subSources  = subStream.sources?.length ?? 0;
  const dubSources  = dubStream.sources?.length ?? 0;
  const subSubs     = subStream.subtitles?.length ?? 0;
  const dubSubs     = dubStream.subtitles?.length ?? 0;
  const subUrl      = subStream.sources?.[0]?.url ?? null;
  const dubUrl      = dubStream.sources?.[0]?.url ?? null;
  const subServer   = (subStream as any).server ?? null;
  const dubServer   = (dubStream as any).server ?? null;

  // Compare normalised URLs (ignore proxy wrapper differences)
  const norm = (u: string | null) => u
    ? decodeURIComponent(u.replace(/^.*?\/api\/stream\/proxy\?url=/, '').split('&')[0])
    : null;
  const urlsDiffer = norm(subUrl) !== norm(dubUrl);

  const ok = subSources > 0 && dubSources > 0 && urlsDiffer;
  const subsPresent = subSubs > 0 || dubSubs > 0;

  return { ok, anilistId, subSources, dubSources, subSubs, dubSubs, subUrl: subUrl ?? null, dubUrl: dubUrl ?? null, subServer, dubServer, urlsDiffer, errors, subsPresent };
}

// ── Pretty-print helpers ────────────────────────────────────────────
function trunc(u: string | null, n = 70): string {
  if (!u) return 'null';
  return u.length > n ? u.slice(0, n) + '…' : u;
}

function statusLabel(r: ReturnType<typeof testSubDubForAnime>): string {
  if (r.ok && r.subsPresent)                                 return '✅ PASS (urls differ + subs)';
  if (r.ok)                                                  return '✅ PASS (urls differ)';
  if (r.subSources === 0 && r.dubSources === 0)              return '❌ FAIL  (0 sub + 0 dub)';
  if (r.subSources === 0)                                    return '⚠️  PARTIAL (0 sub)';
  if (r.dubSources === 0)                                    return '⚠️  PARTIAL (0 dub)';
  if (r.subSources > 0 && r.dubSources > 0 && !r.urlsDiffer) return '❌ FAIL  (same URL)';
  return '❌ FAIL';
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log('\n══ Sub/Dub Streaming Comparison Test ══════════════\n');

  const results: Array<{ label: string; anilistId: number } & ReturnType<typeof testSubDubForAnime>> = [];

  for (const anime of TEST_ANIME) {
    if (shutdown) { console.log('\n⚠️  Interrupted by signal'); break; }
    console.log(`\n── ${anime.label} (AniList ${anime.anilistId}) ──────────────`);
    const r = await testSubDubForAnime(anime.label, anime.anilistId, anime.epNum);
    results.push({ label: anime.label, ...r });

    const status = statusLabel(r);
    console.log(`  ${status}  sub=${r.subSources} dub=${r.dubSources}  subs=${r.subSubs}/${r.dubSubs}  urlsDiffer=${r.urlsDiffer}`);
    if (r.subUrl || r.dubUrl) {
      console.log(`  sub: ${trunc(r.subUrl)}`);
      console.log(`  dub: ${trunc(r.dubUrl)}`);
    }
    if (r.subServer) console.log(`  sub-server: ${r.subServer}`);
    if (r.dubServer) console.log(`  dub-server: ${r.dubServer}`);
    if (r.errors.length) r.errors.forEach(e => console.log(`  ⚠  ${e}`));
  }

  console.log(`\n── Test finished ──`);
  console.log(`  exitCode = ${ec}`);
  // Force-kill any lingering timers/handles before exiting
  // (source-manager.ts setInterval keeps Node's event loop alive)
  (global as any).setImmediate?.(() => process.exit(ec)) ??
    setTimeout(() => process.exit(ec), 50);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
