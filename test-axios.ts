import axios from 'axios';

async function main() {
    const targetUrl = 'https://rrr.web24code.site/prjp/c6/h9ac41b5fc66bd2c7fc5f1a108a24cbea4e3bf97cf39e1471859d2293d85956cec47c550cd7fbe9d1f616719c4e56af64dc9a865e2914207491d4cfb3e76745efb2b1ed59f96e3fcef9c6c5c738/list,3I1YCZMgsMvr.m3u8';
    
    try {
        const res = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://megacloud.blog/'
            }
        });
        console.log('Axios success:', res.status);
    } catch (e: any) {
        console.error('Axios error:', e.message);
    }
}
main();
