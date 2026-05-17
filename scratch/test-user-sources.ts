
import axios from 'axios';
import * as cheerio from 'cheerio';

const sourcesToTest = [
    { name: 'Wcofun', url: 'https://www.wcofun.org/' },
    { name: 'Anicrush', url: 'https://anicrush.to/' },
    { name: 'Miruro', url: 'https://www.miruro.tv/' },
    { name: 'AnimePahe', url: 'https://animepahe.ru/' },
    { name: 'KickAssAnime', url: 'https://kickassanime.am/' },
    { name: 'AnimeHeaven', url: 'https://animeheaven.me/' },
    { name: '4Anime', url: 'https://4anime.gg/' },
    { name: 'DubbedAnime', url: 'https://dubbedanime.biz/' },
    { name: 'GogoAnime', url: 'https://gogoanime3.co/' },
    { name: 'AnimeVibe', url: 'https://animevibe.se/' },
    { name: 'AniWatch', url: 'https://aniwatchtv.to/' }
];

async function probeSources() {
    console.log('🔍 PROBING USER-REQUESTED SOURCES');
    console.log('=================================\n');

    for (const source of sourcesToTest) {
        process.stdout.write(`📡 Testing ${source.name} (${source.url})... `);
        const start = Date.now();
        try {
            const res = await axios.get(source.url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                timeout: 8000
            });
            const duration = Date.now() - start;
            if (res.status === 200) {
                console.log(`✅ OK (${duration}ms)`);
                // Quick check for dub indicators
                const html = res.data;
                const hasDub = /dub/i.test(html);
                if (hasDub) console.log(`   ✨ Found "dub" keywords on homepage`);
            } else {
                console.log(`⚠️ Status ${res.status}`);
            }
        } catch (err) {
            console.log(`❌ FAILED: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    process.exit(0);
}

probeSources();
