import axios from 'axios';

async function testVidStreamingAPI() {
    console.log('🧪 Testing VidStreaming API...\n');
    
    try {
        // Try to access VidStreaming directly
        console.log('📍 Testing VidStreaming server...\n');
        const response = await axios.get('https://vidstreaming.xyz', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Referer': 'https://gogoanime.dk/',
            }
        });
        console.log(`   Status: ${response.status}`);
        console.log(`   Success: VidStreaming is accessible`);
    } catch (error) {
        console.error(`   ❌ Error: ${(error as Error).message}`);
    }
    
    // Try to access MegaCloud
    try {
        console.log('\n📍 Testing MegaCloud server...\n');
        const response = await axios.get('https://megacloud.tv', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            }
        });
        console.log(`   Status: ${response.status}`);
        console.log(`   Success: MegaCloud is accessible`);
    } catch (error) {
        console.error(`   ❌ Error: ${(error as Error).message}`);
    }
    
    // Try to access StreamTape
    try {
        console.log('\n📍 Testing StreamTape server...\n');
        const response = await axios.get('https://streamtape.com', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            }
        });
        console.log(`   Status: ${response.status}`);
        console.log(`   Success: StreamTape is accessible`);
    } catch (error) {
        console.error(`   ❌ Error: ${(error as Error).message}`);
    }
}

testVidStreamingAPI().catch(console.error);
