import fetch from 'node-fetch';

async function main() {
    const variantUrl = 'https://rrr.web24code.site/prjp/c6/h9ac41b5fc66bd2c7fc5f1a108a24cbea4e3bf97cf39e1471859d2293d85956cec47c550cd7fbe9d1f616719c4e56af64dc9a865e2914207491d4cfb3e76745efb2b1ed59f96e3fcef9c6c5c738/4/aGxzLzEwODAvMTA4MA,3I1YCZMgsMvr.m3u8';
    const res = await fetch(variantUrl, { headers: { 'Referer': 'https://megacloud.blog/' } });
    const text = await res.text();
    const lines = text.split('\n');
    let firstSeg = '';
    for (const line of lines) {
        if (line.startsWith('http')) {
            firstSeg = line.trim();
            break;
        }
    }
    console.log('First segment:', firstSeg);
    
    if (firstSeg) {
        console.log('Fetching first segment...');
        const start = Date.now();
        const segRes = await fetch(firstSeg, { headers: { 'Referer': 'https://megacloud.blog/' } });
        console.log('Segment status:', segRes.status, segRes.statusText);
        const buf = await segRes.arrayBuffer();
        console.log(`Downloaded ${buf.byteLength} bytes in ${Date.now() - start} ms`);
    }
}
main();
