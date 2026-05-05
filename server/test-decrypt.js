import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

// The encrypted text from previous test
const encText = 'XVLaQaUMBdEFrhDLbCf-vOzv_PgZi9Cke_gdv5YxmF5fLyeNU_-DHKZWZ7YMNHDHRoSM8Oj7ZSDwe8X1nUJmZ_UItCtE-oBd6OgCoVMj8WMO9YgBCLVuqIqKH1XiBg8p9EvQFNWiz9aiRgE5bpzWJIHm1gifBizn2O2wPUPIhanwf0PnbMuVl_QsTStUdodnxPGsl1qn10np_JRxdxuEF0Y8Ip3GvwrtaOjmgRiFePsq_smm_4B9gcpLKZo5kaegYmT5s8_zHcUUpTcnfyw4';

async function testDecrypt() {
    console.log('Encrypted text length:', encText.length);
    
    try {
        const resp = await axios.post(
            'https://enc-dec.app/api/dec-mega',
            { text: encText, agent: UA },
            { 
                headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, 
                timeout: 15000 
            }
        );
        
        console.log('Status:', resp.status);
        console.log('Result:', JSON.stringify(resp.data, null, 2)?.substring(0, 500));
        
        if (resp.data?.result?.sources) {
            console.log('\n✓ Decrypted sources:');
            resp.data.result.sources.forEach((s, i) => {
                console.log(`  ${i+1}. ${s.file?.substring(0, 80)} (type: ${s.type})`);
            });
        }
    } catch (err) {
        console.log('Error:', err.message);
        if (err.response) {
            console.log('Status:', err.response.status);
            console.log('Data:', err.response.data);
        }
    }
}

testDecrypt();
