
import Fastify from 'fastify';
import cors from '@fastify/cors';
import axios from 'axios';

const fastify = Fastify({
    logger: true
});

// Middleware & Plugins
await fastify.register(cors, {
    origin: '*',
    methods: ['GET', 'OPTIONS']
});

// Ported constants
const MEGAUP_SUBDOMAIN_ALTERNATIVES = ['rrr', 'xm8', 'cdn', 'stream'];
const MEGAUP_BASE_ALTERNATIVES = ['megaup.cc', 'megaup.nl', 'megaup.to', 'megaup.live', 'megaup.net', 'megaup.org'];
const mirrorBlacklist = new Map<string, number>();
const MIRROR_BLACKLIST_TTL = 60 * 1000;

const isMegaupDomain = (hostname: string) => /megaup\.(cc|nl|live|to|net|org)/i.test(hostname);

function unwrapProxyTarget(url: string): string {
    let current = url.trim();
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
        if (seen.has(current)) break;
        seen.add(current);
        if (current.includes('/api/stream/proxy')) {
            try {
                const u = new URL(current);
                const target = u.searchParams.get('url');
                if (!target) break;
                current = decodeURIComponent(target);
            } catch { break; }
        } else break;
    }
    return current;
}

const buildCdnRotationUrls = (failedUrl: string): string[] => {
    try {
        const u = new URL(failedUrl);
        const hostname = u.hostname;
        const alternatives: string[] = [];
        for (const base of MEGAUP_BASE_ALTERNATIVES) {
            for (const sub of MEGAUP_SUBDOMAIN_ALTERNATIVES) {
                const altHostname = `${sub}.${base}`;
                if (altHostname === hostname) continue;
                if ((mirrorBlacklist.get(altHostname) || 0) > Date.now()) continue;

                const newUrl = new URL(failedUrl);
                newUrl.hostname = altHostname;
                alternatives.push(newUrl.toString());
            }
        }
        return alternatives.sort(() => Math.random() - 0.5).slice(0, 5);
    } catch { return []; }
};

const proxyUrl = (url: string, proxyBase: string, referer?: string): string => {
    let s = `${proxyBase}?url=${encodeURIComponent(url)}`;
    if (referer) s += `&referer=${encodeURIComponent(referer)}`;
    return s;
};

const rewriteM3u8Content = (content: string, originalUrl: string, proxyBase: string, referer?: string): string => {
    const normalized = content.replace(
        /(web|lab|code|net|pro|tech|hub|shop|burnt|zone|cdn|site|app|data|media|rrr|xm8|rrr\d+)\d*(code|core|wave|lab|zone|hub|link|pro|burst|data|link|media|host|cdn|file|store|link)\.(site|store|click|buzz|online|top|xyz|shop|cc|nl|live)/gi,
        'megaup.cc'
    );

    const baseUrl = originalUrl.substring(0, originalUrl.lastIndexOf('/') + 1);
    const lines = normalized.split('\n');

    return lines.map(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine || (trimmedLine.startsWith('#') && !trimmedLine.includes('URI='))) {
            if (trimmedLine.includes('URI="')) {
                return trimmedLine.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
                    const absoluteUri = uri.startsWith('http') ? uri : `${baseUrl}${uri}`;
                    return `URI="${proxyUrl(absoluteUri, proxyBase, referer)}"`;
                });
            }
            return line;
        }
        if (!trimmedLine.startsWith('#')) {
            const absoluteUrl = trimmedLine.startsWith('http') ? trimmedLine : `${baseUrl}${trimmedLine}`;
            return proxyUrl(absoluteUrl, proxyBase, referer);
        }
        return line;
    }).join('\n');
};

fastify.get('/api/stream/proxy', async (request, reply) => {
    const { url: rawUrl, referer: refererParam } = request.query as any;
    if (!rawUrl) return reply.code(400).send({ error: 'url param required' });

    const url = unwrapProxyTarget(rawUrl);
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const isM3u8 = url.includes('.m3u8');
    const isSegment = url.includes('.ts') || url.includes('.m4s') || (isMegaupDomain(domain) && /\.(gif|jpg|jpeg|png|webp)$/i.test(urlObj.pathname));

    const referer = refererParam || 'https://megaup.nl/';
    const host = request.headers.host || 'localhost:3002';
    const proxyBase = `http://${host}/api/stream/proxy`;

    const makeRequest = async (targetUrl: string) => {
        return axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            timeout: isM3u8 ? 30000 : 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Referer': referer,
                'Origin': new URL(referer).origin,
                'Accept': '*/*',
            },
            validateStatus: (s) => s < 500 // Allow 404s to pass through for better debugging
        });
    };

    try {
        let response;
        try {
            response = await makeRequest(url);
            if (response.status >= 400) {
                console.warn(`[FASTIFY] Upstream ${response.status} for ${url}`);
            }
        } catch (err: any) {
            const status = err.response?.status;
            console.error(`[FASTIFY] Request failed: ${err.message}`, { status, url });
            if (isMegaupDomain(domain) && (status === 502 || status === 504 || status === 403 || !status)) {
                const alts = buildCdnRotationUrls(url);
                for (const alt of alts) {
                    try {
                        response = await makeRequest(alt);
                        break;
                    } catch { 
                        mirrorBlacklist.set(new URL(alt).hostname, Date.now() + MIRROR_BLACKLIST_TTL);
                    }
                }
            }
            if (!response) throw err;
        }

        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', isSegment ? 'public, max-age=86400' : 'public, max-age=3600');
        
        if (isM3u8) {
            const chunks = [];
            for await (const chunk of response.data) chunks.push(chunk);
            const content = Buffer.concat(chunks).toString();
            const rewritten = rewriteM3u8Content(content, url, proxyBase, referer);
            reply.type('application/vnd.apple.mpegurl').send(rewritten);
        } else {
            const upstreamCt = response.headers['content-type'];
            reply.type(upstreamCt || 'video/MP2T').send(response.data);
        }

    } catch (err: any) {
        reply.code(err.response?.status || 502).send({ error: 'Proxy failed', message: err.message, domain });
    }
});

const start = async () => {
    try {
        const PORT = 3002;
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`🚀 Fastify Proxy running on port ${PORT}`);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

start();
