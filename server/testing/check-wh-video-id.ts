/**
 * Check correct video page URL format
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

async function checkVideoUrl() {
    console.log('Checking video page links from anime page...\n');

    const animeUrl = 'https://watchhentai.net/series/boku-dake-no-hentai-kanojo-the-animation-id-01/';

    try {
        const response = await axios.get(animeUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 30000
        });

        const $ = cheerio.load(response.data);

        // Look for video links
        console.log('Looking for video links...');
        const videoLinks = $('a[href*="/videos/"]');
        console.log(`Found ${videoLinks.length} video links`);

        videoLinks.slice(0, 5).each((i, link) => {
            const href = $(link).attr('href');
            const text = $(link).text().trim();
            console.log(`  ${i + 1}. ${text}: ${href}`);
        });

        // Also check for any links that look like watch/play buttons
        console.log('\nLooking for play/watch buttons...');
        const playButtons = $('a[class*="play"], a[class*="watch"], a[class*="video"]');
        console.log(`Found ${playButtons.length} play buttons`);
        playButtons.slice(0, 5).each((i, link) => {
            const href = $(link).attr('href');
            console.log(`  ${i + 1}: ${href}`);
        });

        // Try to find the first video link pattern
        const allLinks = $('a[href]');
        let firstVideoLink = '';
        allLinks.each((i, link) => {
            const href = $(link).attr('href') || '';
            if (href.includes('/videos/') && !firstVideoLink) {
                firstVideoLink = href;
            }
        });

        if (firstVideoLink) {
            console.log(`\nFirst video link: ${firstVideoLink}`);

            // Fetch the video page to verify
            console.log('\nFetching video page...');
            const videoResponse = await axios.get(firstVideoLink, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 30000
            });

            const video$ = cheerio.load(videoResponse.data);
            const html = video$.html();

            // Look for stream URL
            const sourceMatch = html.match(/source=https%3A%2F%2Fhstorage\.xyz%2Ffiles%2F[^\s"']+/);
            if (sourceMatch) {
                const decodedSource = decodeURIComponent(sourceMatch[0].replace('source=', ''));
                console.log(`\nFound stream URL: ${decodedSource.substring(0, 100)}...`);
            } else {
                console.log('\nNo stream URL found in video page');
            }
        }

    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

checkVideoUrl();
