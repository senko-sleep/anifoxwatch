/**
 * Check WatchHentai HTML structure
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

async function checkStructure() {
    console.log('Fetching https://watchhentai.net/?s=hentai\n');

    try {
        const response = await axios.get('https://watchhentai.net/?s=hentai', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 30000
        });

        const $ = cheerio.load(response.data);

        console.log('Page title:', $('title').text().trim());
        console.log('\n--- Searching for video blocks ---\n');

        // Try different selectors
        const selectors = ['.video-block', '.post', 'article', '.item', '.hentai-entry', '.video-item', '.post-item'];

        for (const selector of selectors) {
            const elements = $(selector);
            if (elements.length > 0) {
                console.log(`Found ${elements.length} elements with selector: ${selector}`);

                // Show structure of first element
                const first = elements.first();
                console.log('\nFirst element HTML (first 500 chars):');
                console.log(first.html()?.substring(0, 500));

                // Show image sources
                const images = first.find('img');
                console.log(`\nFound ${images.length} images in first element`);
                images.each((i, img) => {
                    const src = $(img).attr('src');
                    const dataSrc = $(img).attr('data-src');
                    const alt = $(img).attr('alt');
                    console.log(`  Image ${i + 1}: src=${src?.substring(0, 80)}..., data-src=${dataSrc?.substring(0, 80)}..., alt=${alt}`);
                });

                // Show links
                const links = first.find('a');
                console.log(`\nFound ${links.length} links in first element`);
                links.each((i, link) => {
                    const href = $(link).attr('href');
                    console.log(`  Link ${i + 1}: ${href?.substring(0, 80)}...`);
                });

                break;
            }
        }

        // Also try to find any img tags
        console.log('\n--- All images on page ---\n');
        const allImages = $('img');
        console.log(`Total images: ${allImages.length}`);
        allImages.slice(0, 5).each((i, img) => {
            const src = $(img).attr('src');
            const parent = $(img).parent().prop('tagName');
            console.log(`Image ${i + 1}: ${src?.substring(0, 80)}... (parent: ${parent})`);
        });

    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

checkStructure();
