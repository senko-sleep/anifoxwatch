import axios from 'axios';

async function checkManifest() {
    const baseUrl = 'https://app-82ae23d3-5750-4b13-9cc6-9a9ad55a2b17.cleverapps.io';
    const targetUrl = 'https://rrr.megaup.cc/pz78/c6/h1ca5287751bdc312a5ca0c70e3955fb57d7fbaa16f8766cf87d32bde111f6e607522a875cf0d45b4a84ed386bf9e2b2ad266baf0c4eb2494622e4f18f02605b808cd894dc9741891ad71f89ae7/list,WuxrIQT2oR6y.m3u8';
    const referer = 'https://megaup.nl/';
    
    console.log(`Checking manifest duration for: ${targetUrl}`);

    try {
        const url = `${baseUrl}/api/stream/proxy?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer)}`;
        const response = await axios.get(url);
        
        // 1. Check Master Playlist for resolution/bandwidth
        console.log('\n--- Master Playlist ---');
        console.log(response.data.substring(0, 500));
        
        const lines = response.data.split('\n');
        const levelUrl = lines.find((l: string) => l.includes('/api/stream/proxy?url='));
        if (!levelUrl) throw new Error('No level playlist found');
        
        // 2. Check Level Playlist for segments and duration
        console.log(`\nFetching Level Playlist: ${levelUrl}`);
        const levelResponse = await axios.get(levelUrl);
        const levelBody = levelResponse.data;
        
        console.log('\n--- Level Playlist Content (Partial) ---');
        console.log(levelBody.substring(0, 1000));
        
        // Count segments and sum durations
        const extinfLines = levelBody.match(/#EXTINF:(\d+(\.\d+)?)/g);
        if (extinfLines) {
            const totalDuration = extinfLines.reduce((acc: number, line: string) => {
                const val = parseFloat(line.split(':')[1]);
                return acc + val;
            }, 0);
            
            console.log('\n✅ DURATION INFO FOUND:');
            console.log(`Total Segments: ${extinfLines.length}`);
            console.log(`Total Duration: ${Math.floor(totalDuration / 60)}m ${Math.floor(totalDuration % 60)}s (${totalDuration.toFixed(2)} seconds)`);
            
            if (levelBody.includes('#EXT-X-ENDLIST')) {
                console.log('✅ Found #EXT-X-ENDLIST (VOD stream - seekable)');
            } else {
                console.log('⚠️ Missing #EXT-X-ENDLIST (May be treated as Live/unseekable)');
            }
        } else {
            console.log('\n❌ NO DURATION INFO (#EXTINF) FOUND IN MANIFEST');
        }

    } catch (error: any) {
        console.error('\n❌ ERROR:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

checkManifest();
