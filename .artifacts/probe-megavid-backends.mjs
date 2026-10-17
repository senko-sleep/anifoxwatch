process.env.BROWSER_EXTRACTOR = 'off';
const { isMedia } = await import('../server/dist/services/playable-stream.js');
const headers = { Referer: 'https://megavid.buzz/', Origin: 'https://megavid.buzz', 'User-Agent': 'Mozilla/5.0' };
const lines = body => body.split(/\r?\n/).map(l => l.trim());
async function text(url) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    if (body.length > 256 * 1024) throw new Error('Oversized manifest');
    return body;
}
async function probe(url) {
    const started = Date.now();
    const response = await fetch(url, { headers: { ...headers, Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(4000) });
    if (!response.ok) { await response.body?.cancel(); return { status: response.status, ms: Date.now() - started }; }
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try { while (size < 1024) { const { done, value } = await reader.read(); if (done) break; chunks.push(Buffer.from(value)); size += value.length; } }
    finally { await reader.cancel(); }
    return { status: response.status, media: isMedia(Buffer.concat(chunks).subarray(0, 1024)), ms: Date.now() - started };
}
for (const backend of ['nero', 'loli', 'sora', 'yuki']) {
    const started = Date.now();
    const row = { backend, renditions: [], audio: [], durationMs: 0 };
    try {
        const payload = JSON.parse(await text(`https://megavid.buzz/mal/63832/1/sub/source?axsv=${backend}`));
        if (!payload.source) throw new Error(JSON.stringify(payload));
        row.host = new URL(payload.source).hostname;
        const master = await text(payload.source);
        row.masterPreview = lines(master).filter(l => l.startsWith('#')).slice(0, 12);
        const playlists = lines(master).filter(l => l && !l.startsWith('#')).map(l => ({ url: new URL(l, payload.source).href, audio: false }));
        for (const line of lines(master).filter(l => l.startsWith('#EXT-X-MEDIA:') && l.includes('TYPE=AUDIO'))) {
            const uri = line.match(/URI="([^"]+)"/)?.[1]; if (uri) playlists.push({ url: new URL(uri, payload.source).href, audio: true });
        }
        for (const entry of playlists.slice(0, 5)) {
            const sample = { host: new URL(entry.url).hostname, probes: [] };
            (entry.audio ? row.audio : row.renditions).push(sample);
            try {
                const manifest = await text(entry.url);
                const segments = lines(manifest).filter(l => l && !l.startsWith('#'));
                const indices = [...new Set([0, 12, Math.min(90, segments.length - 1)])];
                sample.segmentCount = segments.length;
                sample.probes = await Promise.all(indices.map(async index => ({ index, ...(await probe(new URL(segments[index], entry.url).href)) })));
            } catch (error) { sample.error = error.message; }
        }
    } catch (error) { row.error = error.message; }
    row.durationMs = Date.now() - started;
    console.log(JSON.stringify(row));
}
