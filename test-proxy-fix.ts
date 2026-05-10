import axios from 'axios';

async function main() {
    // A dead URL that should be rewritten to lgv.megaup.cc
    const deadUrl = 'https://lgv.net22lab.site/c6/h1ca5287751bdc312a5ca0c70e48f10a77827e4a63e9369c198cc69844740622f3634bd67c6514ab3ac469091bb966c718d3ee4eccead23dc61214818f02605b808cd894dc97b1194af7cf997e2/4/aGxzLzEwODAvMDAwMA.gif';
    const proxyUrl = `http://localhost:3001/api/stream/proxy?url=${encodeURIComponent(deadUrl)}&referer=https%3A%2F%2Fmegaup.nl%2F`;
    
    console.log('Fetching from local proxy (should rewrite dead domain):');
    console.log(proxyUrl);
    
    try {
        const res = await axios.get(proxyUrl);
        console.log('Status:', res.status);
        console.log('Content-Type:', res.headers['content-type']);
        console.log('Content Length:', res.data.length);
    } catch (e: any) {
        console.error('Failed:', e.message);
        if (e.response) {
            console.error('Status:', e.response.status);
            console.error('Data:', JSON.stringify(e.response.data));
        }
    }
}
main();
