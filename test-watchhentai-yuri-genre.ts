import axios from 'axios';
import * as cheerio from 'cheerio';

async function testWatchHentaiGenre() {
    const baseUrl = 'https://watchhentai.net';
    const genre = 'yuri';
    const page = 1;

    console.log(`Testing WatchHentai genre: ${genre} (page ${page})`);

    try {
        const url = page > 1
            ? `${baseUrl}/genre/${genre}/page/${page}/`
            : `${baseUrl}/genre/${genre}/`;

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
            console.log('HTML:', firstArticle.html());

            // Extract title
            const img = firstArticle.find('img').first();
            const imgAlt = img.attr('alt') || 'No alt text';
            console.log('Image alt:', imgAlt);

            const h2 = firstArticle.find('h2');
            const h3 = firstArticle.find('h3');
            const titleText = h2.text().trim() || h3.text().trim() || 'No title';
            console.log('Title text:', titleText);

            // Extract link
            const link = firstArticle.find('a').first();
            const href = link.attr('href');
            const text = link.text().trim();
            console.log('Link href:', href);
            console.log('Link text:', text);
        }

        // Check pagination
        console.log('\n=== Pagination ===');
        const pagination = $('.pagination');
        const nextPage = $('a.next.page-numbers');
        const navLinks = $('.nav-links');

        console.log('Pagination found:', pagination.length > 0);
        console.log('Next page link:', nextPage.length > 0);
        console.log('Nav links found:', navLinks.length > 0);

        if (nextPage.length > 0) {
            console.log('Next page href:', nextPage.attr('href'));
        }

        // Check for other potential selectors
        console.log('\n=== Other content selectors ===');
        const divs = $('div');
        console.log(`Number of <div> elements: ${divs.length}`);

        // Look for elements with class containing "post"
        const postElements = $('[class*="post"]');
        console.log(`Elements with 'post' class: ${postElements.length}`);

    } catch (error: any) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Headers:', error.response.headers);
            console.error('Data:', error.response.data.substring(0, 500));
        }
    }
}

testWatchHentaiGenre().catch(console.error);
