/**
 * Test if the upstream aniwatch APIs are working
 */

const UPSTREAM_APIS = [
    'https://aniwatch-api-v2.vercel.app',
    'https://api-aniwatch.onrender.com',
    'https://aniwatch-api.onrender.com',
    'https://hianime-api-chi.vercel.app',
];

async function testUpstreamAPIs() {
    console.log('🧪 Testing upstream aniwatch APIs...\n');

    const episodeId = 'jujutsu-kaisen-the-culling-game-part-1-20401?ep=162345';
    const server = 'hd-2';
    const category = 'dub';

    for (const apiUrl of UPSTREAM_APIS) {
        console.log(`\n📡 Testing: ${apiUrl}`);
        console.log('─'.repeat(70));

        try {
            // Test streaming endpoint
            const streamUrl = `${apiUrl}/api/v2/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${server}&category=${category}`;
            console.log('URL:', streamUrl);

            const response = await fetch(streamUrl, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'AniStreamHub/1.0'
                }
            });

            console.log('Status:', response.status);

            if (response.ok) {
                const data = await response.json();
                console.log('Success:', data.success);
                console.log('Sources:', data.data?.sources?.length || 0);
                
                if (data.data?.sources?.length > 0) {
                    console.log('✅ This API works!');
                    console.log('First source URL preview:', data.data.sources[0].url.substring(0, 100));
                } else {
                    console.log('⚠️  No sources returned');
                }
            } else {
                const errorText = await response.text();
                console.log('❌ Error:', errorText.substring(0, 200));
            }
        } catch (error) {
            console.error('❌ Request failed:', error.message);
        }
    }
}

testUpstreamAPIs();
