import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

async function testFullFlow() {
    // Step 1: Get iframe from animekai
    console.log('=== Step 1: Fetch animekai iframe ===');
    const iframeUrl = 'https://animekai.to/iframe/Ksf-sOWq_1C7hntHyI7D-mpY4MILyRGQ7I9zzXl2cRT41Q_CtK2Qwh0raahTeg';
    const iframeResp = await axios.get(iframeUrl, {
        headers: { 'User-Agent': UA, 'Referer': 'https://animekai.to/' },
        timeout: 15000,
    });
    
    // Parse megaup URL from iframe
    const megaupMatch = iframeResp.data.match(/iframe[^]*?src=["']([^"']*megaup[^"']*)["']/i);
    if (!megaupMatch) {
        console.log('No megaup iframe found');
        return;
    }
    const megaupEmbedUrl = megaupMatch[1];
    console.log('Megaup URL:', megaupEmbedUrl.substring(0, 80));
    
    // Step 2: Fetch /media/ endpoint
    console.log('\n=== Step 2: Fetch /media/ ===');
    const mediaUrl = megaupEmbedUrl.replace('/e/', '/media/');
    const mediaResp = await axios.get(mediaUrl, {
        headers: {
            'User-Agent': UA,
            'Referer': megaupEmbedUrl,
            'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 15000,
    });
    
    console.log('Status:', mediaResp.status);
    const encText = mediaResp.data?.result;
    console.log('Encrypted text length:', encText?.length);
    
    // Step 3: Decrypt
    console.log('\n=== Step 3: Decrypt ===');
    const decResp = await axios.post(
        'https://enc-dec.app/api/dec-mega',
        { text: encText, agent: UA },
        { 
            headers: { 
                'Content-Type': 'application/json', 
                'User-Agent': UA 
            }, 
            timeout: 15000 
        }
    );
    
    console.log('Decrypt status:', decResp.status);
    const decrypted = decResp.data?.result;
    
    if (decrypted?.sources?.length) {
        console.log('\n✓✓✓ SUCCESS! Sources found:', decrypted.sources.length);
        decrypted.sources.forEach((s, i) => {
            console.log(`  ${i+1}. ${s.file?.substring(0, 80)}`);
            console.log(`     Quality: ${s.label || 'auto'}, Type: ${s.type}`);
        });
    } else {
        console.log('\n✗ No sources in decrypted data');
        console.log('Decrypted:', JSON.stringify(decrypted)?.substring(0, 300));
    }
}

testFullFlow().catch(err => {
    console.log('Error:', err.message);
    if (err.response) {
        console.log('Status:', err.response.status);
        console.log('Data:', err.response.data);
    }
});
