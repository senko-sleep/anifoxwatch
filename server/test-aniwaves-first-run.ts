/**
 * Aniwaves-First Run Test
 * Tests all registered sources for AniList ID 189046 (Frieren), Episode 1
 * and reports which sources can produce working streams.
 *
 * Usage: npx tsx test-aniwaves-first-run.ts
 */

import { AniwavesSource } from './src/sources/aniwaves-source.js';
import { GogoanimeSource } from './src/sources/gogoanime-source.js';
import { AllAnimeSource } from './src/sources/allanime-source.js';
import { GogoOrAtSource } from './src/sources/gogo-or-at-source.js';
import { WcofunSource } from './src/sources/wcofun-source.js';
import { AnimeHeavenSource } from './src/sources/animeheaven-source.js';
import { NineAnimeSource } from './src/sources/nineanime-source.js';
import type { BaseAnimeSource } from './src/sources/base-source.js';

const ANILIST_ID = 189046;
const EPISODE_NUM = 1;
const TEST_TITLE = 'Frieren: Beyond Journey\'s End'; // AniList 189046

interface SourceResult {
  name: string;
  searchWorked: boolean;
  episodesFound: number;
  streamCount: number;
  streamUrls: string[];
  embedUrls: string[];
  error?: string;
  durationMs: number;
}

async function testSource(
  source: any,
  title: string,
  epNum: number
): Promise<SourceResult> {
  const start = Date.now();
  const result: SourceResult = {
    name: source.name,
    searchWorked: false,
    episodesFound: 0,
    streamCount: 0,
    streamUrls: [],
    embedUrls: [],
    durationMs: 0,
  };

  try {
    // 1) Search
    console.log(`\n  🔍 [${source.name}] Searching for "${title}"...`);
    const searchResult = await Promise.race([
      source.search(title, 1),
      new Promise<any>((_, rej) => setTimeout(() => rej(new Error('search timeout')), 15_000)),
    ]);

    if (!searchResult?.results?.length) {
      result.error = 'No search results';
      result.durationMs = Date.now() - start;
      return result;
    }

    result.searchWorked = true;
    const bestMatch = searchResult.results[0];
    console.log(`     → Found: "${bestMatch.title}" (${bestMatch.id})`);

    // 2) Get episodes
    console.log(`  📋 [${source.name}] Getting episodes...`);
    const episodes = await Promise.race([
      source.getEpisodes(bestMatch.id),
      new Promise<any[]>((_, rej) => setTimeout(() => rej(new Error('episodes timeout')), 12_000)),
    ]);

    if (!episodes?.length) {
      result.error = 'No episodes found';
      result.durationMs = Date.now() - start;
      return result;
    }

    result.episodesFound = episodes.length;
    const targetEp = episodes.find((e: any) => e.number === epNum) || episodes[0];
    console.log(`     → Episode ${targetEp.number} ID: ${targetEp.id}`);

    // 3) Get streaming links
    console.log(`  🎬 [${source.name}] Getting streams for ep ${targetEp.number}...`);
    const streamData = await Promise.race([
      source.getStreamingLinks(targetEp.id, undefined, 'sub'),
      new Promise<any>((_, rej) => setTimeout(() => rej(new Error('stream timeout')), 20_000)),
    ]);

    result.streamCount = streamData?.sources?.length ?? 0;
    if (streamData?.sources) {
      for (const s of streamData.sources) {
        const url = s.url || '';
        if (s.isEmbed || (!url.includes('.m3u8') && !url.includes('.mp4'))) {
          result.embedUrls.push(url.substring(0, 120));
        } else {
          result.streamUrls.push(url.substring(0, 120));
        }
      }
    }

    if (result.streamCount === 0) {
      result.error = 'Source returned 0 streams';
    }
  } catch (err: any) {
    result.error = err?.message?.substring(0, 120) || String(err);
  }

  result.durationMs = Date.now() - start;
  return result;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Aniwaves-First Run Test — AniList ID 189046, Episode 1');
  console.log('  Frieren: Beyond Journey\'s End');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Aniwaves FIRST — this is the priority source per the user requirement
  const sources: any[] = [
    new AniwavesSource(),
    new GogoanimeSource(),
    new GogoOrAtSource(),
    new WcofunSource(),
    new AllAnimeSource(),
    new AnimeHeavenSource(),
    new NineAnimeSource(),
  ];

  const results: SourceResult[] = [];

  for (const source of sources) {
    console.log(`\n┌─────────────────────────────────────┐`);
    console.log(`│  Testing: ${source.name.padEnd(26)} │`);
    console.log(`└─────────────────────────────────────┘`);

    const r = await testSource(source, TEST_TITLE, EPISODE_NUM);
    results.push(r);

    // Quick summary
    if (r.streamCount > 0) {
      console.log(`  ✅ WORKING — ${r.streamCount} stream(s) in ${r.durationMs}ms`);
      for (const u of r.streamUrls.slice(0, 2)) console.log(`     M3U8: ${u}`);
      for (const u of r.embedUrls.slice(0, 2)) console.log(`     Embed: ${u}`);
    } else {
      console.log(`  ❌ FAILED — ${r.error || 'no streams'} (${r.durationMs}ms)`);
    }
  }

  // ═══════ FINAL REPORT ═══════
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('  FINAL REPORT');
  console.log('═══════════════════════════════════════════════════════════');

  const working = results.filter(r => r.streamCount > 0);
  const failing = results.filter(r => r.streamCount === 0);

  console.log(`\n  ✅ WORKING SOURCES (${working.length}):`);
  for (const r of working) {
    console.log(`    • ${r.name.padEnd(20)} ${r.streamCount} stream(s), ${r.durationMs}ms`);
  }

  console.log(`\n  ❌ FAILING SOURCES (${failing.length}):`);
  for (const r of failing) {
    console.log(`    • ${r.name.padEnd(20)} ${r.error || 'unknown error'}`);
  }

  const workingNames = working.map(r => r.name);
  const failingNames = failing.map(r => r.name);

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  RECOMMENDATION for registered-sources.ts:`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`\n  Keep these sources (working):`);
  for (const n of workingNames) console.log(`    ✅ '${n}'`);
  console.log(`\n  Remove/disable these sources (not working for ep 1):`);
  for (const n of failingNames) console.log(`    ❌ '${n}'`);

  // Output the suggested registered-sources.ts content
  const adultSources = ['WatchHentai', 'Hanime', 'AkiH'];
  const mainWorking = workingNames.filter(n => !adultSources.includes(n));

  console.log('\n\n  ── Suggested REGISTERED_SOURCE_NAMES ──');
  console.log('  export const REGISTERED_SOURCE_NAMES: readonly string[] = [');
  for (const n of mainWorking) {
    console.log(`    '${n}',`);
  }
  for (const n of adultSources) {
    console.log(`    // Adult: '${n}',  // (keep if needed)`);
  }
  console.log('  ];');

  console.log('\n\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
