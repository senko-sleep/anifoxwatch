import fetch from 'node-fetch';

async function main() {
    const proxyUrl = 'http://localhost:3001/api/stream/proxy?url=https%3A%2F%2Frrr.web24code.site%2Fprjp%2Fc6%2Fh9ac41b5fc66bd2c7fc5f1a108a24cbea4e3bf97cf39e1471859d2293d85956cec47c550cd7fbe9d1f616719c4e56af64dc9a865e2914207491d4cfb3e76745efb2b1ed59f96e3fcef9c6c5c738%2Flist%2C3I1YCZMgsMvr.m3u8&referer=https%3A%2F%2Fmegacloud.blog%2F';
    console.log('Fetching from local proxy:', proxyUrl);
    
    try {
        const res = await fetch(proxyUrl);
        console.log('Status:', res.status, res.statusText);
        const text = await res.text();
        console.log('Body start:', text.substring(0, 200));
    } catch (e) {
        console.error(e);
    }
}
main();
