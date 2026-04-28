import axios from 'axios';
import * as cheerio from 'cheerio';

async function testAnimeFLVRealURL() {
    console.log('🧪 Testing actual AnimeFLV URL...\n');
    
    // Test the actual URL format
    const testUrls = [
        'https://animeflv.net/ver/naruto-shippuden-1',
        'https://animeflv.net/ver/naruto-shippuden-2',
    ];
    
    for (const url of testUrls) {
        console.log(`\n📍 Testing: ${url}`);
        
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
                timeout: 10000,
            });
            
            const $ = cheerio.load(response.data);
            
            // Check if page loaded
            const title = $('h1.Title').text().trim();
            console.log(`   📺 Title: ${title}`);
            
            // Look for videos
            const scriptContent = $('script:contains("var videos")').html() || '';
            const videosMatch = scriptContent.match(/var videos\s*=\s*(\{[\s\S]*?\});/);
            
            if (videosMatch) {
                console.log(`   ✅ Found videos variable`);
                const videos = JSON.parse(videosMatch[1]);
                console.log(`   📊 Video categories: ${Object.keys(videos).join(', ')}`);
                
                if (videos.SUB) {
                    console.log(`   🎬 SUB servers: ${videos.SUB.length}`);
                    if (videos.SUB.length > 0) {
                        console.log(`   🔗 First server: ${JSON.stringify(videos.SUB[0])}`);
                    }
                }
            } else {
                console.log(`   ❌ No videos variable found`);
            }
            
            // Check for iframe
            const iframe = $('iframe').attr('src');
            if (iframe) {
                console.log(`   🎞️  Found iframe: ${iframe}`);
            }
            
        } catch (error) {
            console.log(`   ❌ Error: ${(error as Error).message}`);
        }
    }
}

testAnimeFLVRealURL().catch(console.error);
