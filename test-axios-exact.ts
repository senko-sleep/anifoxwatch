import axios from 'axios';

async function main() {
    const url = 'https://rrr.web24code.site/prjp/c6/h9ac41b5fc66bd2c7fc5f1a108a24cbea4e3bf97cf39e1471859d2293d85956cec47c550cd7fbe9d1f616719c4e56af64dc9a865e2914207491d4cfb3e76745efb2b1ed59f96e3fcef9c6c5c738/list,3I1YCZMgsMvr.m3u8';
    const referer = 'https://megacloud.blog/';
    const origin = 'https://megacloud.blog';
    
    try {
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': referer,
            'Origin': origin,
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
        };

        const res = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            headers,
            timeout: 30_000,
            maxRedirects: 5,
            validateStatus: (s: number) => s < 400
        });
        console.log('Success!', res.status);
    } catch (e: any) {
        console.error('Error!', e.message, e.code);
    }
}
main();
