import axios from 'axios';
import { createHash, createDecipheriv } from 'crypto';

async function testAllAnimeRaw() {
    console.log('🧪 Testing AllAnime raw API response...\n');
    
    const API_URL = 'https://api.allanime.day/api';
    
    try {
        // Test search with simple query
        console.log('📍 Testing search...\n');
        const searchResponse = await axios.post(API_URL, {
            query: '{shows(search:{query:"naruto"},limit:1){edges{_id}}}'
        }, {
            headers: { 'Content-Type': 'application/json', 'Referer': 'https://allmanga.to/' }
        });
        
        const showId = searchResponse.data.data?.shows?.edges?.[0]?._id;
        if (!showId) {
            console.log('   ❌ No show found');
            return;
        }
        console.log(`   ✅ Found show: ${showId}`);
        
        // Test episode sources with simple query
        console.log('\n📍 Testing episode sources...\n');
        const episodeResponse = await axios.post(API_URL, {
            query: `{episode(showId:"${showId}",translationType:sub,episodeString:"1"){sourceUrls}}`
        }, {
            headers: { 'Content-Type': 'application/json', 'Referer': 'https://allmanga.to/' }
        });
        
        const data = episodeResponse.data.data;
        console.log('   📦 Response structure:', Object.keys(data || {}));
        console.log('   📦 Has tobeparsed:', !!data?.tobeparsed);
        console.log('   📦 Has _m:', data?._m);
        
        if (data?.tobeparsed) {
            console.log('\n📍 Attempting decryption...\n');
            const tbp = data.tobeparsed;
            const method = data._m || 'unknown';
            
            console.log(`   Method: ${method}`);
            console.log(`   Encrypted data length: ${tbp.length}`);
            console.log(`   Encrypted data (first 100 chars): ${tbp.substring(0, 100)}...`);
            
            // Try different decryption approaches for b7 method
            if (method === 'b7') {
                console.log('\n   Trying b7-specific decryption...\n');
                
                // b7 might use a different key derivation
                const possibleKeys = [
                    'b7',
                    'b7' + 'SimtVuagFbGR2K7P',
                    'SimtVuagFbGR2K7P' + 'b7',
                    Buffer.from('b7', 'utf8').toString('base64'),
                ];
                
                for (const keyString of possibleKeys) {
                    try {
                        const key = createHash('sha256').update(keyString).digest();
                        const raw = Buffer.from(tbp, 'base64');
                        
                        // Try different IV/tag positions
                        const configs = [
                            { ivStart: 0, ivLen: 12, tagOffset: -16 },
                            { ivStart: 0, ivLen: 16, tagOffset: -16 },
                            { ivStart: 16, ivLen: 12, tagOffset: -16 },
                            { ivStart: 0, ivLen: 12, tagOffset: 0 },
                        ];
                        
                        for (const config of configs) {
                            try {
                                const iv = raw.subarray(config.ivStart, config.ivStart + config.ivLen);
                                const tag = config.tagOffset < 0 ? raw.subarray(config.tagOffset) : raw.subarray(config.tagOffset, config.tagOffset + 16);
                                const ciphertextStart = config.ivStart + config.ivLen;
                                const ciphertextEnd = config.tagOffset < 0 ? raw.length - 16 : config.tagOffset;
                                const ciphertext = raw.subarray(ciphertextStart, ciphertextEnd);
                                
                                const decipher = createDecipheriv('aes-256-gcm', key, iv);
                                decipher.setAuthTag(tag);
                                const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
                                const result = JSON.parse(decrypted.toString('utf-8'));
                                console.log(`   � SUCCESS! Decrypted with key: ${keyString}, config: iv=${config.ivStart}+${config.ivLen}, tag=${config.tagOffset}`);
                                console.log(`   📦 Decrypted data:`, JSON.stringify(result, null, 2));
                                return;
                            } catch (e) {
                                // Try next config
                            }
                        }
                    } catch (e) {
                        // Try next key
                    }
                }
            }
        }
    } catch (error) {
        console.error(`   ❌ Error: ${(error as Error).message}`);
        if ((error as any).response) {
            console.error(`   Status: ${(error as any).response.status}`);
            console.error(`   Data: ${(error as any).response.data}`);
        }
    }
}

testAllAnimeRaw().catch(console.error);
