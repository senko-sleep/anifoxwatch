import puppeteer from 'puppeteer';

async function testPuppeteer() {
    console.log('🧪 Testing Puppeteer with aniwatchtv.to...\n');
    
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        console.log('✅ Browser launched');
        
        const page = await browser.newPage();
        
        // Set user agent to avoid detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        const url = 'https://aniwatchtv.to/watch/one-piece?ep=1';
        console.log(`📍 Navigating to: ${url}`);
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
        console.log('✅ Page loaded');
        
        // Wait for video player to load
        await page.waitForSelector('video, iframe', { timeout: 15000 }).catch(() => {
            console.log('⚠️ No video/iframe found within timeout');
        });
        
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
            
            // Check for script tags with video data
            const scripts = document.querySelectorAll('script');
            scripts.forEach(script => {
                const content = script.textContent || '';
                if (content.includes('video') || content.includes('source')) {
                    const urlMatch = content.match(/https?:\/\/[^\s"']+\.(m3u8|mp4)/);
                    if (urlMatch) {
                        results.push({ url: urlMatch[0], quality: 'extracted' });
                    }
                }
            });
            
            return results;
        });
        
        await browser.close();
        
        console.log(`\n📺 Found ${sources.length} sources:`);
        sources.forEach((s, i) => {
            console.log(`   ${i + 1}. ${s.quality}: ${s.url.substring(0, 80)}...`);
        });
        
        if (sources.length === 0) {
            console.log('\n❌ No sources found');
        } else {
            console.log('\n✅ Puppeteer successfully bypassed Cloudflare!');
        }
    } catch (error) {
        console.error(`\n❌ Error: ${(error as Error).message}`);
        console.error(`Stack: ${(error as Error).stack}`);
    }
}

testPuppeteer().catch(console.error);
