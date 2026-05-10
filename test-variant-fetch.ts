import axios from 'axios';

async function test() {
    const variantUrl = 'https://rrr.megaup.cc/plgv/c6/h1ca5287751bdc312a5ca0c70e48f10a77827e4a63e9369c198cc69844740622f3634bd67c6514ab3ac469091bb966c718d3ee4eccead23dc61214818f02605b808cd894dc97b1194af7cf997e2/4/aGxzLzEwODAvMTA4MA,WuxrIQT2oR6y.m3u8';
    const referer = 'https://megaup.nl/';
    try {
        const resp = await axios.get(variantUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': referer
            },
            timeout: 10000
        });
        console.log(`Variant fetch status: ${resp.status}`);
        console.log('Content:', resp.data.substring(0, 500));
    } catch (err) {
        console.error(`Variant fetch failed: ${err.message}`);
    }
}

test();
