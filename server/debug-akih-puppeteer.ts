import puppeteer from 'puppeteer';

async function debugAkiHPuppeteer() {
    console.log('Debugging AkiH Puppeteer stream extraction...');

    const videoId = 'VRU3eNgVLx';
    const watchUrl = `https://aki-h.com/watch/${videoId}/`;
    const embedUrl = `https://aki-h.com/video/45992/`;

    console.log(`Target URL: ${embedUrl}`);

    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Log all network requests
        const allRequests: string[] = [];
        page.on('request', (request: any) => {
            const url = request.url();
            if (url.includes('.m3u8') || url.includes('.mp4') || url.includes('stream') || url.includes('hstorage')) {
                console.log(`[REQUEST] ${url.substring(0, 100)}`);
                allRequests.push(url);
            }
        });

        // Log all responses
        page.on('response', async (response: any) => {
            const url = response.url();
            if (url.includes('.m3u8') || url.includes('.mp4') || url.includes('stream') || url.includes('hstorage')) {
                console.log(`[RESPONSE] ${url.substring(0, 100)} - Status: ${response.status()}`);
                allRequests.push(url);
            }
        });

        console.log('Navigating to page...');
        await page.goto(embedUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        console.log('Waiting 2 seconds for page to load...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Extract all scripts and check for video URLs before navigating to iframe
        console.log('\nChecking for video URLs in initial page...');
        const initialPageSources = await page.evaluate(() => {
            const results: any[] = [];
            
            // Scan all scripts for URLs
            document.querySelectorAll('script').forEach(s => {
                const text = s.textContent || '';
                const m3u8Matches = text.match(/https?:\/\/[^\s"']+\.(m3u8)/g);
                const mp4Matches = text.match(/https?:\/\/[^\s"']+\.(mp4)/g);
                const anyUrlMatches = text.match(/https?:\/\/[^\s"']+/g);
                if (m3u8Matches) results.push({ type: 'script-m3u8', urls: m3u8Matches });
                if (mp4Matches) results.push({ type: 'script-mp4', urls: mp4Matches });
                if (anyUrlMatches && anyUrlMatches.length > 0) {
                    results.push({ type: 'all-urls', count: anyUrlMatches.length, sample: anyUrlMatches.slice(0, 5) });
                }
            });

            // Check for data attributes
            document.querySelectorAll('[data-src], [data-url], [data-video], [data-file]').forEach((el: any) => {
                results.push({ 
                    type: 'data-attr', 
                    tag: el.tagName,
                    dataSrc: el.getAttribute('data-src'),
                    dataUrl: el.getAttribute('data-url'),
                    dataVideo: el.getAttribute('data-video'),
                    dataFile: el.getAttribute('data-file')
                });
            });
            
            return results;
        });

        console.log('Initial page sources:');
        console.log(JSON.stringify(initialPageSources, null, 2));

        // Check for iframe and try to navigate
        const iframeSrc = await page.evaluate(() => {
            const iframe = document.querySelector('iframe[src*="v.aki-h.com"]');
            return iframe ? (iframe as any).src : null;
        });

        if (iframeSrc) {
            console.log(`\nFound iframe: ${iframeSrc}`);
            console.log('Attempting to navigate to iframe (may be blocked)...');
            try {
                await page.goto(iframeSrc, { waitUntil: 'networkidle2', timeout: 30000 });
                console.log('Waiting 3 seconds...');
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (e: any) {
                console.log(`Iframe navigation failed: ${e.message}`);
            }
        } else {
            console.log('No iframe found');
        }

        // Try to extract video sources from the page
        console.log('\nExtracting video sources from page...');
        const pageSources = await page.evaluate(() => {
            const results: any[] = [];
            
            // Check video elements
            document.querySelectorAll('video').forEach((el: any) => {
                results.push({ type: 'video', src: el.src, currentSrc: el.currentSrc });
            });
            
            // Check source elements
            document.querySelectorAll('source').forEach((el: any) => {
                results.push({ type: 'source', src: el.src });
            });
            
            // Check iframes
            document.querySelectorAll('iframe').forEach((el: any) => {
                results.push({ type: 'iframe', src: el.src });
            });
            
            // Scan scripts for URLs
            document.querySelectorAll('script').forEach(s => {
                const text = s.textContent || '';
                const m3u8Matches = text.match(/https?:\/\/[^\s"']+\.(m3u8)/g);
                const mp4Matches = text.match(/https?:\/\/[^\s"']+\.(mp4)/g);
                if (m3u8Matches) results.push({ type: 'script-m3u8', urls: m3u8Matches });
                if (mp4Matches) results.push({ type: 'script-mp4', urls: mp4Matches });
            });

            // Check for data attributes
            document.querySelectorAll('[data-src], [data-url], [data-video]').forEach((el: any) => {
                results.push({ 
                    type: 'data-attr', 
                    tag: el.tagName,
                    dataSrc: el.getAttribute('data-src'),
                    dataUrl: el.getAttribute('data-url'),
                    dataVideo: el.getAttribute('data-video')
                });
            });
            
            return results;
        });

        // Also get page HTML for inspection
        const pageHtml = await page.content();
        console.log('\nPage HTML length:', pageHtml.length);
        
        // Save HTML for inspection
        const fs = await import('fs');
        fs.writeFileSync('akih-page.html', pageHtml);
        console.log('Page HTML saved to akih-page.html');

        console.log('\nPage sources found:');
        console.log(JSON.stringify(pageSources, null, 2));

        console.log('\nAll network requests with video URLs:');
        console.log(`Total: ${allRequests.length}`);
        allRequests.slice(0, 10).forEach(url => console.log(`  ${url}`));

        // Take a screenshot
        await page.screenshot({ path: 'akih-debug.png', fullPage: true });
        console.log('\nScreenshot saved to akih-debug.png');

    } finally {
        await browser.close();
    }
}

debugAkiHPuppeteer().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
