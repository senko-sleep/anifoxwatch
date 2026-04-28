import puppeteer from 'puppeteer';

async function testPuppeteerWithNetwork() {
    console.log('🧪 Testing Puppeteer with network interception...\n');
    
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        console.log('✅ Browser launched');
        
        const page = await browser.newPage();
        
        // Set user agent to avoid detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        // Intercept network requests to find video URLs
        const videoUrls: string[] = [];
        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('.m3u8') || url.includes('.mp4') || url.includes('video')) {
                console.log(`🎥 Found video URL: ${url.substring(0, 80)}...`);
                videoUrls.push(url);
            }
        });
        
        const url = 'https://aniwatchtv.to/watch/one-piece?ep=1';
        console.log(`📍 Navigating to: ${url}`);
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
        console.log('✅ Page loaded');
        
        // Wait longer for video player to load
        console.log('⏳ Waiting 10 seconds for video player...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Try to click play button
        try {
            await page.click('button[aria-label*="play"], .play-button, #play-btn', { timeout: 5000 });
            console.log('✅ Clicked play button');
            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch {
            console.log('⚠️ No play button found');
        }
        
        // Extract video sources from page
        const sources = await page.evaluate(() => {
            const results: Array<{ url: string; quality: string }> = [];
            
            // Check for video tags
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
                const src = video.getAttribute('src');
                if (src) results.push({ url: src, quality: 'auto' });
            });
            
            // Check for iframes
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                const src = iframe.getAttribute('src');
                if (src && src.includes('http')) results.push({ url: src, quality: 'embed' });
            });
            
            return results;
        });
        
        await browser.close();
        
        console.log(`\n📺 Found ${sources.length} sources from DOM:`);
        sources.forEach((s, i) => {
            console.log(`   ${i + 1}. ${s.quality}: ${s.url.substring(0, 80)}...`);
        });
        
        console.log(`\n📺 Found ${videoUrls.length} sources from network:`);
        videoUrls.forEach((s, i) => {
            console.log(`   ${i + 1}. ${s.substring(0, 80)}...`);
        });
        
        const totalSources = sources.length + videoUrls.length;
        if (totalSources === 0) {
            console.log('\n❌ No sources found');
        } else {
            console.log(`\n✅ Found ${totalSources} total sources!`);
        }
    } catch (error) {
        console.error(`\n❌ Error: ${(error as Error).message}`);
        console.error(`Stack: ${(error as Error).stack}`);
    }
}

testPuppeteerWithNetwork().catch(console.error);
