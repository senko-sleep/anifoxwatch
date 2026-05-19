import axios from 'axios';

async function testProxy() {
    // Replace 'rrr.megaup.cc' with 'megaup.cc'
    const targetUrl = 'https://megaup.cc/pz78/v5/bHKUod1G9wxOlygxw5IgQ9Hgn5KY-k2nBzswnh0cJNXcxK-RnxlFKs6xGkJG5nmAq3XH7tZzvId4rdRcHsHtX6xPOmkzQfAaSvnDzn_B7iLZ-CAnOyAaD9ScEycqM6UaqciMcrWAV4A/list.m3u8';
    const referer = 'https://megaup.nl/';
    
    console.log(`Testing direct request to: ${targetUrl}`);

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'Referer': referer,
                'Origin': 'https://megaup.nl'
            }
        });
        
        console.log('\n✅ SUCCESS:');
        console.log('Status:', response.status);
    } catch (error: any) {
        console.error('\n❌ ERROR:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
        } else {
            console.error(error.message);
        }
    }
}

testProxy();
