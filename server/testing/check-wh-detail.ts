/**
 * Check WatchHentai detail page structure
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

async function checkDetail() {
    console.log('Fetching detail page...\n');

    try {
        const url = 'https://watchhentai.net/series/boku-dake-no-hentai-kanojo-the-animation-id-01/';
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 30000
        });

        const $ = cheerio.load(response.data);

        console.log('Page title:', $('title').text().trim());

        // Find all images in entry-content
        console.log('\n--- Images in .entry-content ---');
        const contentImages = $('.entry-content img');
        console.log(`Found ${contentImages.length} images`);
        contentImages.each((i, img) => {
            const src = $(img).attr('src');
            const dataSrc = $(img).attr('data-src');
            const alt = $(img).attr('alt');
            console.log(`  Image ${i + 1}: src=${src?.substring(0, 80)}..., data-src=${dataSrc?.substring(0, 80)}..., alt=${alt}`);
        });

        // Try other selectors
        console.log('\n--- Looking for poster images ---');
        const posterImg = $('img[alt*="Boku Dake no Hentai"]');
        console.log(`Found ${posterImg.length} images with title in alt`);

        // Check for og:image meta
        console.log('\n--- Open Graph image ---');
        const ogImage = $('meta[property="og:image"]').attr('content');
        console.log(`og:image: ${ogImage}`);

        // Check for twitter:image meta
        const twitterImage = $('meta[name="twitter:image"]').attr('content');
        console.log(`twitter:image: ${twitterImage}`);

        // Look for any image with poster in URL
        console.log('\n--- Images with poster in URL ---');
        const allImages = $('img');
        allImages.each((i, img) => {
            const src = $(img).attr('src') || '';
            if (src.includes('poster')) {
                console.log(`  Found: ${src.substring(0, 100)}...`);
            }
        });

    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

checkDetail();
