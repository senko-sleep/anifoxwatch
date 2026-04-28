import axios from 'axios';

async function main() {
    const showId = 'ReooPAxPMsHM4KPMY'; // One Piece
    const epNum = '1';
    
    const headers = {
        'Content-Type': 'application/json',
        'Referer': 'https://allmanga.to/',
        'Origin': 'https://allmanga.to',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    };

    // Test the episode query
    const query = `{episode(showId:"${showId}",translationType:sub,episodeString:"${epNum}"){sourceUrls}}`;
    console.log('Query:', query);
    
    const resp = await axios.post('https://api.allanime.day/api', { query }, { headers, timeout: 15000 });
    console.log('\nFull response.data:', JSON.stringify(resp.data, null, 2).slice(0, 2000));
    
    // Also try alternate endpoint
    console.log('\n--- Trying alternate endpoint ---');
    const resp2 = await axios.post('https://allanime.day/api', { query }, { headers, timeout: 15000 }).catch(e => {
        console.log('Alt endpoint error:', e.message);
        return null;
    });
    if (resp2) {
        console.log('Alt response.data:', JSON.stringify(resp2.data, null, 2).slice(0, 2000));
    }

    // Try a different show - Solo Leveling (newer, likely has sources)
    console.log('\n--- Trying Solo Leveling ---');
    const searchQuery = `{shows(search:{query:"Solo Leveling"},limit:5,page:1,countryOrigin:ALL){edges{_id,name,availableEpisodesDetail}}}`;
    const searchResp = await axios.post('https://api.allanime.day/api', { query: searchQuery }, { headers, timeout: 15000 });
    const searchData = searchResp.data?.data;
    if (searchData?.tobeparsed) {
        console.log('Search is encrypted! Length:', searchData.tobeparsed.length);
    } else {
        const edges = searchData?.shows?.edges || [];
        console.log('Found:', edges.length, 'results');
        if (edges.length > 0) {
            const show = edges[0];
            console.log('Show:', show._id, show.name, JSON.stringify(show.availableEpisodesDetail));
            
            const subEps = show.availableEpisodesDetail?.sub || [];
            if (subEps.length > 0) {
                const epQuery = `{episode(showId:"${show._id}",translationType:sub,episodeString:"${subEps[0]}"){sourceUrls}}`;
                console.log('\nEpisode query:', epQuery);
                const epResp = await axios.post('https://api.allanime.day/api', { query: epQuery }, { headers, timeout: 15000 });
                const epData = epResp.data?.data;
                console.log('Episode response keys:', Object.keys(epData || {}));
                if (epData?.tobeparsed) {
                    console.log('Episode is encrypted!');
                    // Try decryption
                    const { createHash, createDecipheriv } = await import('crypto');
                    const tbp = epData.tobeparsed;
                    const raw = Buffer.from(tbp, 'base64');
                    
                    // Try current key
                    const keys = ['Xot36i3lK3:v1', 'SimtVuagFbGR2K7P', 'P7K2RGbFgauVtmiS'];
                    for (const keyStr of keys) {
                        try {
                            const key = createHash('sha256').update(keyStr).digest();
                            const iv = raw.subarray(1, 13);
                            const ciphertext = raw.subarray(13, raw.length - 16);
                            const tag = raw.subarray(raw.length - 16);
                            const decipher = createDecipheriv('aes-256-gcm', key, iv);
                            decipher.setAuthTag(tag);
                            const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
                            const result = JSON.parse(decrypted.toString('utf-8'));
                            console.log(`\nDecrypted with key "${keyStr}"!`);
                            console.log('Decrypted keys:', Object.keys(result));
                            const sourceUrls = result?.episode?.sourceUrls || [];
                            console.log('sourceUrls count:', sourceUrls.length);
                            for (const su of sourceUrls.slice(0, 5)) {
                                const rawUrl = su.sourceUrl?.startsWith('--') ? decodeHex(su.sourceUrl.slice(2)) : su.sourceUrl;
                                console.log(`  ${su.sourceName}: ${rawUrl?.slice(0, 100)}`);
                            }
                            break;
                        } catch (e: any) {
                            console.log(`Key "${keyStr}" failed:`, e.message?.slice(0, 60));
                        }
                    }
                } else if (epData?.episode?.sourceUrls) {
                    console.log('sourceUrls (plain):', epData.episode.sourceUrls.length);
                    for (const su of epData.episode.sourceUrls.slice(0, 5)) {
                        const rawUrl = su.sourceUrl?.startsWith('--') ? decodeHex(su.sourceUrl.slice(2)) : su.sourceUrl;
                        console.log(`  ${su.sourceName}: ${rawUrl?.slice(0, 100)}`);
                    }
                } else {
                    console.log('Episode data:', JSON.stringify(epData, null, 2).slice(0, 500));
                }
            }
        }
    }
    
    process.exit(0);
}

function decodeHex(hex: string): string {
    let result = '';
    for (let i = 0; i < hex.length - 1; i += 2) {
        result += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ 56);
    }
    return result;
}

main().catch(e => { console.error(e); process.exit(1); });
