/**
 * Debug script: resolve AniList ID 147105 (Witch Hat Atelier) to streaming episodes
 * Run: npx tsx server/test-witch-hat.ts
 */
import { sourceManager } from './src/services/source-manager.js';

async function main() {
    console.log('=== Witch Hat Atelier Episode Resolution Debug ===\n');

    const anilistId = 'anilist-147105';

    // Step 1: test AnimeKai search directly
    console.log('--- Step 1: AnimeKai search for "Witch Hat Atelier" ---');
    const akSearch1 = await sourceManager.search('Witch Hat Atelier', 1, 'AnimeKai');
    console.log(`Results (${akSearch1.results?.length || 0}):`);
    akSearch1.results?.slice(0, 5).forEach(r => console.log(`  [${r.id}] "${r.title}"`));

    console.log('\n--- Step 2: AnimeKai search for "Tongari Boshi no Atelier" ---');
    const akSearch2 = await sourceManager.search('Tongari Boshi no Atelier', 1, 'AnimeKai');
    console.log(`Results (${akSearch2.results?.length || 0}):`);
    akSearch2.results?.slice(0, 5).forEach(r => console.log(`  [${r.id}] "${r.title}"`));

    console.log('\n--- Step 3: AnimeKai search for "Tongari Boshi" ---');
    const akSearch3 = await sourceManager.search('Tongari Boshi', 1, 'AnimeKai');
    console.log(`Results (${akSearch3.results?.length || 0}):`);
    akSearch3.results?.slice(0, 5).forEach(r => console.log(`  [${r.id}] "${r.title}"`));

    console.log('\n--- Step 4: Full getEpisodes for anilist-147105 ---');
    try {
        const episodes = await sourceManager.getEpisodes(anilistId);
        console.log(`Episodes found: ${episodes.length}`);
        if (episodes.length > 0) {
            console.log('First 3:', episodes.slice(0, 3).map(e => `EP${e.number} [${e.id}]`).join(', '));
        }
    } catch (e) {
        console.error('getEpisodes threw:', e);
    }

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
