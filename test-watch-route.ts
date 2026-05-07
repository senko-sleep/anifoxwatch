import fetch from 'node-fetch';

async function main() {
    const url = 'http://localhost:3001/api/stream/watch/animekai-rezero-kara-hajimeru-isekai-seikatsu-4th-season-8lj0%24ep%3D2%24token%3Ddd788uTxtRLniGlB2Mjc?ep=2&category=dub';
    console.log('Fetching stream from local API:', url);
    const start = Date.now();
    try {
        const res = await fetch(url);
        console.log('Status:', res.status, res.statusText);
        const data = await res.json();
        console.log(`Resolved in ${Date.now() - start}ms`);
        console.log('Sources:', data.sources?.length);
        console.log('Category:', data.category);
        if (data.sources?.[0]) console.log('First source:', data.sources[0].url);
    } catch (e) {
        console.error('Error:', e);
    }
}
main();
