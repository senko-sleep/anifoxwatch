/**
 * Regression test: AniList ID → episodes resolution
 * Run: npx tsx server/test-anilist-episodes.ts
 */
import { sourceManager } from './src/services/source-manager.js';

const CASES = [
    { id: 'anilist-189046', name: 'Re:ZERO S4',         minEps: 1 },
    { id: 'anilist-147105', name: 'Witch Hat Atelier',  minEps: 1 },
    { id: 'anilist-21355',  name: 'Re:ZERO S1',         minEps: 10 },
];

async function main() {
    let passed = 0;
    for (const c of CASES) {
        process.stdout.write(`Testing ${c.name} (${c.id})... `);
        try {
            const eps = await sourceManager.getEpisodes(c.id);
            if (eps.length >= c.minEps) {
                console.log(`✅ ${eps.length} episodes (EP1 id: ${eps[0]?.id?.slice(0,40)})`);
                passed++;
            } else {
                console.log(`❌ got ${eps.length} episodes, expected >= ${c.minEps}`);
            }
        } catch (e) {
            console.log(`❌ threw: ${(e as Error).message}`);
        }
    }
    console.log(`\n${passed}/${CASES.length} passed`);
    process.exit(passed === CASES.length ? 0 : 1);
}
main();
