import axios from 'axios';
import * as cheerio from 'cheerio';

async function testDubPatterns() {
    console.log('=== Testing Dub URL Patterns ===\n');
    
    const baseUrl = 'https://anitaku.to';
    const patterns = [
        'naruto-dub-episode-1',
        'naruto-dubbed-episode-1', 
        'naruto-dub-1',
    ];
    
    for (const pattern of patterns) {
        console.log(`Testing: ${pattern}`);
        try {
            const resp = await axios.get(`${baseUrl}/${pattern}`, {
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' },
                validateStatus: () => true, // Don't throw on 404
            });
            console.log(`  Status: ${resp.status}`);
            
            if (resp.status === 200) {
                const $ = cheerio.load(resp.data);
                const embeds: string[] = [];
                $('.anime_muti_link ul li a').each((_, el) => {
                    const dataVideo = $(el).attr('data-video');
                    if (dataVideo) embeds.push(dataVideo);
                });
                console.log(`  Embeds found: ${embeds.length}`);
                if (embeds.length > 0) {
                    console.log(`  First embed: ${embeds[0].substring(0, 80)}...`);
                }
            }
        } catch (e) {
            console.log(`  Error: ${(e as Error).message}`);
        }
        console.log('');
    }
    
    // Also check if there's a separate "dub" anime entry
    console.log('Checking category pages...');
    const categoryPatterns = [
        'naruto-dub',
        'one-piece-dub',
    ];
    
    for (const pattern of categoryPatterns) {
        console.log(`\nTesting category: ${pattern}`);
        try {
            const resp = await axios.get(`${baseUrl}/category/${pattern}`, {
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' },
                validateStatus: () => true,
            });
            console.log(`  Status: ${resp.status}`);
            
            if (resp.status === 200) {
                const $ = cheerio.load(resp.data);
                const title = $('.anime_info_body_bg h1').text().trim();
                console.log(`  Title: ${title}`);
                
                // Count episode links
                const epCount = $('a[href*="-episode-"]').length;
                console.log(`  Episode links: ${epCount}`);
            }
        } catch (e) {
            console.log(`  Error: ${(e as Error).message}`);
        }
    }
    
    console.log('\n=== Done ===');
}

testDubPatterns()
    .then(() => process.exit(0))
    .catch(e => {
        console.error('Error:', e);
        process.exit(1);
    });
