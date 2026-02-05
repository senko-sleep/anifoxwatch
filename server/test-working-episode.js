/**
 * Test with a known working episode from earlier tests
 */

const UPSTREAM_API = 'https://aniwatch-api-v2.vercel.app';

async function testWorkingEpisode() {
    console.log('🧪 Testing with known working episode: steinsgate-3?ep=230\n');

    const episodeId = 'steinsgate-3?ep=230';
    const server = 'hd-2';
    const category = 'sub';

    try {
        const streamUrl = `${UPSTREAM_API}/api/v2/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(episodeId)}&server=${server}&category=${category}`;
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
                console.log('✅ Steins;Gate episode works!');
                console.log('First source:', {
                    quality: data.data.sources[0].quality,
                    isM3U8: data.data.sources[0].isM3U8,
                    urlPreview: data.data.sources[0].url.substring(0, 100)
                });
            }
        } else {
            const errorText = await response.text();
            console.log('❌ Error:', errorText);
        }
    } catch (error) {
        console.error('❌ Request failed:', error.message);
    }

    // Now test the JJK episode
    console.log('\n\n🧪 Testing JJK episode: jujutsu-kaisen-the-culling-game-part-1-20401?ep=162345\n');

    const jjkEpisodeId = 'jujutsu-kaisen-the-culling-game-part-1-20401?ep=162345';

    try {
        const streamUrl = `${UPSTREAM_API}/api/v2/hianime/episode/sources?animeEpisodeId=${encodeURIComponent(jjkEpisodeId)}&server=${server}&category=dub`;
        console.log('URL:', streamUrl);

        const response = await fetch(streamUrl);
        console.log('Status:', response.status);

        if (response.ok) {
            const data = await response.json();
            console.log('Success:', data.success);
            console.log('Sources:', data.data?.sources?.length || 0);
        } else {
            const errorText = await response.text();
            console.log('❌ Error:', errorText.substring(0, 300));
        }
    } catch (error) {
        console.error('❌ Request failed:', error.message);
    }
}

testWorkingEpisode();
