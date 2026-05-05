import axios from 'axios';

async function testDubHtml() {
    console.log('=== Examining Dub Page HTML ===\n');
    
    const baseUrl = 'https://anitaku.to';
    
    console.log('Fetching naruto-dub-episode-1...');
    try {
        const resp = await axios.get(`${baseUrl}/naruto-dub-episode-1`, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        
        const html = resp.data;
        console.log(`HTML length: ${html.length}`);
        
        // Look for video-related content
        const hasIframe = html.includes('iframe');
        const hasDataVideo = html.includes('data-video');
        const hasAnimeMutiLink = html.includes('anime_muti_link');
        const hasVideoPlayer = html.includes('video-player') || html.includes('video_player');
        const hasError = html.includes('404') || html.includes('not found') || html.includes('error');
        
        console.log(`Has iframe: ${hasIframe}`);
        console.log(`Has data-video: ${hasDataVideo}`);
        console.log(`Has anime_muti_link: ${hasAnimeMutiLink}`);
        console.log(`Has video player: ${hasVideoPlayer}`);
        console.log(`Has error: ${hasError}`);
        
        // Extract iframe src if present
        const iframeMatch = html.match(/iframe[^>]+src=["']([^"']+)["']/);
        if (iframeMatch) {
            console.log(`Iframe src: ${iframeMatch[1]}`);
        }
        
        // Look for any video-related URLs
        const videoUrls = [...html.matchAll(/(https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8|mpd)[^"'\s<>]*)/g)];
        console.log(`\nDirect video URLs found: ${videoUrls.length}`);
        videoUrls.slice(0, 3).forEach((m, i) => console.log(`  [${i}] ${m[1].substring(0, 80)}`));
        
        // Look for any data-video patterns
        const dataVideoMatches = [...html.matchAll(/data-video=["']([^"']+)["']/g)];
        console.log(`\ndata-video attributes: ${dataVideoMatches.length}`);
        dataVideoMatches.slice(0, 3).forEach((m, i) => console.log(`  [${i}] ${m[1].substring(0, 80)}`));
        
        // Check for vibeplayer URLs
        const vibeMatches = [...html.matchAll(/vibeplayer[^"'\s<>]*/g)];
        console.log(`\nvibeplayer references: ${vibeMatches.length}`);
        
        // Print a snippet of the HTML around video areas
        const videoIndex = html.indexOf('video');
        if (videoIndex > 0) {
            console.log(`\nHTML snippet around 'video':`);
            console.log(html.substring(Math.max(0, videoIndex - 200), videoIndex + 200));
        }
        
    } catch (e) {
        console.log(`Error: ${(e as Error).message}`);
    }
    
    console.log('\n=== Done ===');
}

testDubHtml()
    .then(() => process.exit(0))
    .catch(e => {
        console.error('Error:', e);
        process.exit(1);
    });
