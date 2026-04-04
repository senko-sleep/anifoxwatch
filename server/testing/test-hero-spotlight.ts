/**
 * Run: npx tsx testing/test-hero-spotlight.ts
 * Verifies AniList banner URLs + synopsis length for home hero.
 */
import { fetchHeroSpotlightAnime } from '../src/services/hero-spotlight-service.ts';

async function main() {
  const r = await fetchHeroSpotlightAnime();
  console.log('count', r.length);
  if (r.length === 0) {
    console.error('FAIL: no hero entries');
    process.exit(1);
  }
  let ok = true;
  for (const x of r.slice(0, 5)) {
    const b = x.bannerImage || '';
    const title = x.title?.english || x.title?.romaji || '?';
    const descLen = x.description?.length ?? 0;
    const bannerOk = /^https?:\/\//i.test(b);
    const descOk = descLen >= 55;
    if (!bannerOk || !descOk) ok = false;
    console.log('---');
    console.log(title);
    console.log('  banner:', bannerOk ? b.slice(0, 72) + '...' : 'MISSING');
    console.log('  desc len:', descLen, descOk ? 'OK' : 'FAIL');
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
