
import axios from 'axios';

const sourcesToTest = [
    { name: 'Anicrush', url: 'https://anicrush.to/' },
    { name: 'AnimePahe', url: 'https://animepahe.ru/' },
    { name: 'AnimeSuge', url: 'https://animesuge.to/' },
    { name: 'KickAssAnime', url: 'https://kickassanime.am/' },
    { name: '4Anime', url: 'https://4anime.gg/' },
    { name: 'AnimeHeaven', url: 'https://animeheaven.me/' },
    { name: 'GogoAnime', url: 'https://gogoanime3.co/' },
    { name: 'AniWatch', url: 'https://hianime.to/' }, // New domain for Aniwatch
    { name: 'Wcofun', url: 'https://www.wcofun.net/' }, // Alternative Wcofun domain
    { name: 'Miruro', url: 'https://www.miruro.tv/' },
    { name: 'Kaido', url: 'https://kaido.to/' }
];

async function probeSources() {
    console.log('🔍 PROBING USER-REQUESTED SOURCES (BATCH 2)');
    console.log('=========================================\n');

    for (const source of sourcesToTest) {
        process.stdout.write(`📡 Testing ${source.name} (${source.url})... `);
        const start = Date.now();
        try {
            const res = await axios.get(source.url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                },
                timeout: 8000
            });
            const duration = Date.now() - start;
            console.log(`✅ OK (${duration}ms)`);
            if (res.data.includes('dub')) console.log(`   ✨ Found "dub" keywords`);
        } catch (err) {
            console.log(`❌ FAILED: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}

probeSources();
