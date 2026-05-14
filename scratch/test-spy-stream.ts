import axios from 'axios';

async function testStream() {
    const baseUrl = 'https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io';
    const slug = 'spy-x-family-season-3-v2q8';
    const ep = '1';
    
    console.log(`Testing stream for episode: ${slug} (ep ${ep})`);

    try {
        const url = `${baseUrl}/api/stream/watch/${slug}?ep=${ep}&category=dub`;
        console.log(`GET ${url}`);
        
        const response = await axios.get(url);
        console.log('\nResponse:');
        console.log(JSON.stringify(response.data, null, 2));
        
        if (response.data.dubFallback) {
            console.log('\n⚠️ DUB FALLBACK DETECTED (Server served Sub instead of Dub)');
        } else {
            console.log('\n✅ DUB RECEIVED (No fallback flagged)');
        }

        if (response.data.sources && response.data.sources.length > 0) {
            console.log(`\nSource: ${response.data.source}`);
            console.log(`Quality: ${response.data.sources[0].quality}`);
            console.log(`URL: ${response.data.sources[0].url.substring(0, 100)}...`);
        } else {
            console.log('\n❌ NO SOURCES FOUND');
        }
    } catch (error: any) {
        console.error('\n❌ API ERROR:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

testStream();
