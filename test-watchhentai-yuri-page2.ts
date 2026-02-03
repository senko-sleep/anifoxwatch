import axios from 'axios';
import * as cheerio from 'cheerio';

async function testWatchHentaiPage2() {
    const baseUrl = 'https://watchhentai.net';
    const genre = 'yuri';
    const page = 2;

    console.log(`Testing WatchHentai genre: ${genre} (page ${page})`);

    try {
        const url = `${baseUrl}/genre/${genre}/page/${page}/`;

        console.log(`Fetching URL: ${url}`);

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 10000
        });

        console.log(`HTTP Status: ${response.status}`);
        const html = response.data;
        const $ = cheerio.load(html);

        // Check page title
        const title = $('title').text().trim();
        console.log(`Page Title: ${title}`);

        // Try to find anime elements
        console.log('\n=== Testing article elements ===');
        const articles = $('article');
        console.log(`Number of <article> elements: ${articles.length}`);

        if (articles.length > 0) {
            console.log('\n=== First article details ===');
            const firstArticle = $(articles[0]);

            // Extract title
            const img = firstArticle.find('img').first();
            const imgAlt = img.attr('alt') || 'No alt text';
            console.log('Image alt:', imgAlt);

            const h3 = firstArticle.find('h3');
            const titleText = h3.text().trim() || 'No title';
            console.log('Title text:', titleText);

            // Extract link
            const link = firstArticle.find('a').first();
            const href = link.attr('href');
            console.log('Link href:', href);
        }

        // Check pagination
        console.log('\n=== Pagination ===');
        const pagination = $('.pagination');
        console.log('Pagination HTML:', pagination.html());

        const pageNumbers = $('.page-numbers');
        console.log('Page numbers:', pageNumbers.length);
        pageNumbers.each((index, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            console.log(`  ${index}: ${text} -> ${href}`);
        });

        // Look for next page link specifically
        const nextPage = pagination.find('.next');
        console.log('Next page element:', nextPage.length > 0 ? nextPage.html() : 'Not found');

    } catch (error: any) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Headers:', error.response.headers);
            console.error('Data:', error.response.data.substring(0, 500));
        }
    }
}

testWatchHentaiPage2().catch(console.error);
