import fetch from 'node-fetch';

async function main() {
    const segmentUrl = 'https://rjp.web24code.site/c6/h9ac41b5fc66bd2c7fc5f1a108a24cbea4e3bf97cf39e1471859d2293d85956cec47c550cd7fbe9d1f616719c4e56af64dc9a865e2914207491d4cfb3e76745efb2b1ed59f96e3fcef9c6c5c738/4/aGxzLzEwODAvMTA4MA,3I1YCZMgsMvr,1.ts';
    console.log('Fetching segment:', segmentUrl);
    
    const start = Date.now();
    try {
        const res = await fetch(segmentUrl, {
            headers: { 'Referer': 'https://megacloud.blog/' }
        });
        console.log('Status:', res.status, res.statusText);
        const buffer = await res.arrayBuffer();
        console.log('Downloaded bytes:', buffer.byteLength, 'in', Date.now() - start, 'ms');
    } catch (e) {
        console.error(e);
    }
}
main();
