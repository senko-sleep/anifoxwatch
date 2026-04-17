import { KaidoSource } from './src/sources/kaido-source.js';

const src = new KaidoSource();

async function test() {
    console.log('Testing Kaido search...');
    console.log('Base URL:', src.baseUrl);
    
    try {
        const r = await src.search('naruto', 1);
        console.log('Results:', r.results?.length || 0);
        if (r.results?.[0]) {
            console.log('First:', r.results[0].title, r.results[0].id);
        }
    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

test();
