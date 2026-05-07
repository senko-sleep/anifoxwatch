import fetch from 'node-fetch';

async function main() {
    const masterUrl = 'https://rrr.web24code.site/prjp/c6/h9ac41b5fc66bd2c7fc5f1a108a24cbea4e3bf97cf39e1471859d2293d85956cec47c550cd7fbe9d1f616719c4e56af64dc9a865e2914207491d4cfb3e76745efb2b1ed59f96e3fcef9c6c5c738/list,3I1YCZMgsMvr.m3u8';
    
    // First, let's get the master manifest
    const res = await fetch(masterUrl, {
        headers: { 'Referer': 'https://megacloud.blog/' }
    });
    const masterText = await res.text();
    console.log('Master M3U8:');
    console.log(masterText);

    // Extract the variant URL
    const lines = masterText.split('\n');
    let variantPath = '';
    for (const line of lines) {
        if (line && !line.startsWith('#')) {
            variantPath = line.trim();
            break;
        }
    }

    if (!variantPath) {
        console.log('No variant path found.');
        return;
    }

    const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
    const variantUrl = baseUrl + variantPath;
    console.log('\nFetching variant:', variantUrl);

    // Fetch the variant manifest
    const varRes = await fetch(variantUrl, {
        headers: { 'Referer': 'https://megacloud.blog/' }
    });
    const varText = await varRes.text();
    console.log('Variant M3U8 start:', varText.substring(0, 300));
}
main();
