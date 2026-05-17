/**
 * Sub/Dub streaming quick check — 2 anime only to stay under 120s.
 * Files that changed during this test:
 *   - src/sources/animekai-source.ts
 *       extractMegaupStream now returns { sources, subtitles } (subtitles from enc-dec.app)
 *       getStreamingLinks now maps that shape correctly
 */
import { sourceManager } from '../src/services/source-manager.js';

const TEST_ANIME: Array<{ label: string; anilistId: number; epNum: number }> = [
  // AL 20 = Naruto — 220 eps, confirmed both sub + dub
  { label: 'Naruto',        anilistId: 20,      epNum: 1   },
  // AL 101922 = Demon Slayer — 26 eps, both tracks work
  { label: 'Demon Slayer',  anilistId: 101922,  epNum: 1   },
];

const TIMEOUT_SUB    = 30_000;
const TIMEOUT_DUB    = 30_000;
const TIMEOUT_EPS    = 20_000;

async function race<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

async function testSubDubForAnime(
  label: string,
  anilistId: number,
  epNum: number
): Promise<{
  ok: boolean; anilistId: number; subSources: number; dubSources: number;
  subSubs: number; dubSubs: number; subUrl: string | null; dubUrl: string | null;
  subServer: string | null; dubServer: string | null; urlsDiffer: boolean;
  errors: string[]; subsPresent: boolean;
}> {
  const errors: string[] = [];
  const anilistIdStr = `anilist-${anilistId}`;

  let episodes: Array<{ id: string; number: number }> = [];
  try {
    episodes = await race(sourceManager.getEpisodes(anilistIdStr), TIMEOUT_EPS, `getEpisodes(${label})`);
  } catch (e: any) {
    errors.push(`Episodes failed: ${e.message}`);
    return { ok: false, anilistId, subSources: 0, dubSources: 0, subSubs: 0, dubSubs: 0, subUrl: null, dubUrl: null, subServer: null, dubServer: null, urlsDiffer: false, errors, subsPresent: false };
  }
  if (episodes.length === 0) {
    errors.push('No episodes');
    return { ok: false, anilistId, subSources: 0, dubSources: 0, subSubs: 0, dubSubs: 0, subUrl: null, dubUrl: null, subServer: null, dubServer: null, urlsDiffer: false, errors, subsPresent: false };
  }
  const ep = episodes.find((e) => e.number === epNum) ?? episodes[0];

  let subStream: any = { sources: [], subtitles: [] };
  let dubStream: any = { sources: [], subtitles: [] };
  try {
    subStream = await race(sourceManager.getStreamingLinks(ep.id, undefined, 'sub', epNum, anilistId), TIMEOUT_SUB, `sub`);
  } catch (e: any) { errors.push(`Sub: ${e.message}`); }
  try {
    dubStream = await race(sourceManager.getStreamingLinks(ep.id, undefined, 'dub', epNum, anilistId), TIMEOUT_DUB, `dub`);
  } catch (e: any) { errors.push(`Dub: ${e.message}`); }

  const subSources  = subStream.sources?.length ?? 0;
  const dubSources  = dubStream.sources?.length ?? 0;
  const subSubs     = subStream.subtitles?.length ?? 0;
  const dubSubs     = dubStream.subtitles?.length ?? 0;
  const subUrl      = subStream.sources?.[0]?.url ?? null;
  const dubUrl      = dubStream.sources?.[0]?.url ?? null;
  const subServer   = subStream.server ?? null;
  const dubServer   = dubStream.server ?? null;
  const norm = (u: string | null) => u
    ? decodeURIComponent(u.replace(/^.*?\/api\/stream\/proxy\?url=/, '').split('&')[0])
    : null;
  const urlsDiffer = norm(subUrl) !== norm(dubUrl);
  const ok = subSources > 0 && dubSources > 0 && urlsDiffer;
  const subsPresent = subSubs > 0 || dubSubs > 0;

  return { ok, anilistId, subSources, dubSources, subSubs, dubSubs, subUrl: subUrl ?? null, dubUrl: dubUrl ?? null, subServer, dubServer, urlsDiffer, errors, subsPresent };
}

function trunc(u: string | null, n = 70) { return !u ? 'null' : (u.length > n ? u.slice(0, n) + '…' : u); }
function status(r: ReturnType<typeof testSubDubForAnime>) {
  if (r.ok && r.subsPresent) return '✅ PASS (urls differ + subs)';
  if (r.ok)                        return '✅ PASS (urls differ)';
  if (r.subSources===0&&r.dubSources===0) return '❌ FAIL (0 sub + 0 dub)';
  if (r.subSources===0)            return '⚠️  PARTIAL (0 sub)';
  if (r.dubSources===0)            return '⚠️  PARTIAL (0 dub)';
  if (r.subSources>0&&r.dubSources>0&&!r.urlsDiffer) return '❌ FAIL (same URL)';
  return '❌ FAIL';
}

async function main() {
  console.log('\n══ Sub/Dub Streaming Test ══════════════\n');
  const results: any[] = [];

  for (const a of TEST_ANIME) {
    console.log(`\n── ${a.label} (AL ${a.anilistId}) ──────────────`);
    const r = await testSubDubForAnime(a.label, a.anilistId, a.epNum);
    results.push({ label: a.label, ...r });
    console.log(`  ${status(r)}  sub=${r.subSources} dub=${r.dubSources}  subs=${r.subSubs}/${r.dubSubs}  urlsDiffer=${r.urlsDiffer}`);
    if (r.subUrl || r.dubUrl) { console.log(`  sub: ${trunc(r.subUrl)}`); console.log(`  dub: ${trunc(r.dubUrl)}`); }
    if (r.subServer) console.log(`  sub-server: ${r.subServer}`);
    if (r.dubServer) console.log(`  dub-server: ${r.dubServer}`);
    r.errors.forEach(e => console.log(`  ⚠  ${e}`));
  }

  console.log('\n══ Summary ════════════════════════════════════════');
  const pass    = results.filter(r => r.ok).length;
  const partial = results.filter(r => !r.ok && (r.subSources>0 || r.dubSources>0)).length;
  const fail    = results.filter(r => !r.ok && r.subSources===0 && r.dubSources===0).length;
  console.log(`  PASS:${pass}  PARTIAL:${partial}  FAIL:${fail}  TOTAL:${results.length}`);

  console.log('\n  AniListId | Label        | SUB | DUB | subs | urlsDiffer | Status');
  for (const r of results) {
    console.log(`  ${String(r.anilistId).padStart(9)} | ${r.label.padEnd(12)} | ${String(r.subSources).padStart(3)} | ${String(r.dubSources).padStart(3)} | ${String(r.subSubs).padStart(4)} | ${String(r.urlsDiffer).padStart(10)} | ${status(r)}`);
  }

  const ec = results.every(r => r.ok) ? 0 : results.every(r => r.subSources===0 && r.dubSources===0) ? 2 : 1;
  console.log(`\n── DONE  exitCode=${ec} ──`);
  (global as any).setImmediate?.(() => process.exit(ec)) ?? setTimeout(() => process.exit(ec), 100);
}

main().catch(e => { console.error(e); process.exit(1); });
