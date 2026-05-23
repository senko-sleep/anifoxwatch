import axios from 'axios';
import * as cheerio from 'cheerio';

async function debugAkiHAPI() {
    const videoId = 'gVeegWqZIw';
    
    // Try different API endpoints
    const endpoints = [
        `https://aki-h.com/api/videos/${videoId}`,
        `https://aki-h.com/api/v2/videos/${videoId}`,
        `https://aki-h.com/ajax/videos/${videoId}`,
    ];
    
    for (const endpoint of endpoints) {
        try {
            console.log(`\nTrying: ${endpoint}`);
            const response = await axios.get(endpoint, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                },
                timeout: 10000
            });
            console.log(`Response status: ${response.status}`);
            console.log(`Response data:`, JSON.stringify(response.data, null, 2).substring(0, 500));
        } catch (error: any) {
            console.log(`Error: ${error.response?.status || error.message}`);
        }
    }
    
    // Check the video page for data attributes
    console.log('\n=== Checking video page for data ===');
    const url = `https://aki-h.com/videos/${videoId}/`;
    const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 15000
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Look for data-video in the page
    const dataVideo = $('body').attr('data-video') || $('html').attr('data-video');
    console.log('body/html data-video:', dataVideo);
    
    // Look for scripts with video info
    $('script').each((i, script) => {
        const content = $(script).html() || '';
        if (content.includes('video') || content.includes('source') || content.includes('mp4')) {
            const fileMatch = content.match(/file\s*:\s*["']([^"']+)["']/i);
            if (fileMatch) {
                console.log(`\nScript ${i} found file:`, fileMatch[1]);
            }
        }
    });
}

debugAkiHAPI().catch(console.error);