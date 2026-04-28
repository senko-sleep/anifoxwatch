import axios from 'axios';

async function testDeployments() {
    console.log('🧪 Testing deployments...\n');
    
    // Test Vercel API
    console.log('📍 Testing Vercel API (https://anifoxwatch.vercel.app/api/health)\n');
    try {
        const vercelResponse = await axios.get('https://anifoxwatch.vercel.app/api/health');
        console.log(`   ✅ Vercel API Status: ${vercelResponse.status}`);
        console.log(`   📦 Response:`, vercelResponse.data);
    } catch (error) {
        console.log(`   ❌ Vercel API Error: ${(error as Error).message}`);
    }
    
    // Test Vercel streaming endpoint
    console.log('\n📍 Testing Vercel streaming endpoint\n');
    try {
        const streamResponse = await axios.get('https://anifoxwatch.vercel.app/api/stream/watch/one-piece', {
            params: { ep: 1, category: 'sub' },
            timeout: 30000
        });
        console.log(`   ✅ Streaming Status: ${streamResponse.status}`);
        console.log(`   📺 Sources found: ${streamResponse.data.sources?.length || 0}`);
        if (streamResponse.data.sources && streamResponse.data.sources.length > 0) {
            console.log(`   🎉 Streaming is working!`);
        }
    } catch (error) {
        console.log(`   ❌ Streaming Error: ${(error as Error).message}`);
    }
    
    // Test Firebase hosting
    console.log('\n📍 Testing Firebase Hosting (https://anifoxwatch.web.app)\n');
    try {
        const firebaseResponse = await axios.get('https://anifoxwatch.web.app');
        console.log(`   ✅ Firebase Status: ${firebaseResponse.status}`);
        console.log(`   📦 Content-Type: ${firebaseResponse.headers['content-type']}`);
    } catch (error) {
        console.log(`   ❌ Firebase Error: ${(error as Error).message}`);
    }
    
    console.log('\n🎉 Deployment testing complete!');
}

testDeployments().catch(console.error);
