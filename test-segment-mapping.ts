import axios from 'axios';

async function test() {
    const segmentPath = '/c6/h1ca5287751bdc312a5ca0c70e48f10a77827e4a63e9369c198cc69844740622f3634bd67c6514ab3ac469091bb966c718d3ee4eccead23dc61214818f02605b808cd894dc97b1194af7cf997e2/4/aGxzLzEwODAvMDAwMA.gif';
    const referer = 'https://megaup.nl/';
    
    // Try with rrr.megaup.cc/lgv
    const url1 = `https://rrr.megaup.cc/lgv${segmentPath}`;
    console.log(`Testing ${url1}...`);
    try {
        const resp = await axios.head(url1, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': referer },
            timeout: 5000
        });
        console.log(`Result 1: ${resp.status}`);
    } catch (err) {
        console.log(`Result 1 failed: ${err.message}`);
    }

    // Try with rrr.megaup.cc/plgv (since it was in the master URL)
    const url2 = `https://rrr.megaup.cc/plgv${segmentPath}`;
    console.log(`Testing ${url2}...`);
    try {
        const resp = await axios.head(url2, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': referer },
            timeout: 5000
        });
        console.log(`Result 2: ${resp.status}`);
    } catch (err) {
        console.log(`Result 2 failed: ${err.message}`);
    }
}

test();
