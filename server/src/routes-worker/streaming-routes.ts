import { Hono } from 'hono';
import { SourceManager } from '../services/source-manager.js';

/**
 * Streaming routes for Cloudflare Worker (Hono)
 * Mirrors the Express streaming routes functionality
 */

// Helper proxy URL generator
const proxyUrl = (url: string, proxyBase: string): string => {
    return `${proxyBase}?url=${encodeURIComponent(url)}`;
};

// Helper to get proxy base URL from Hono context
const getProxyBaseUrl = (c: any): string => {
    const url = new URL(c.req.url);
    return `${url.protocol}//${url.host}/api/stream/proxy`;
};

export function createStreamingRoutes(sourceManager: SourceManager) {
    const app = new Hono();

    // Get episode servers
    app.get('/servers/:episodeId', async (c) => {
        const episodeId = decodeURIComponent(c.req.param('episodeId'));
        
        try {
            if (typeof sourceManager.getEpisodeServers === 'function') {
                const servers = await sourceManager.getEpisodeServers(episodeId);
                return c.json({ servers });
            }
            return c.json({ servers: [] });
        } catch (e: any) {
            return c.json({ error: e.message }, 500);
        }
    });

    // Get streaming links
    app.get('/watch/:episodeId', async (c) => {
        const episodeId = decodeURIComponent(c.req.param('episodeId'));
        const server = c.req.query('server');
        const category = c.req.query('category') as 'sub' | 'dub' | undefined;
        const tryAll = c.req.query('tryAll') !== 'false';
        const useProxy = c.req.query('proxy') !== 'false';
        const proxyBase = getProxyBaseUrl(c);

        try {
            if (typeof sourceManager.getStreamingLinks === 'function') {
                // Try specific server first if provided
                if (server) {
                    const data = await sourceManager.getStreamingLinks(episodeId, server, category);
                    if (data.sources?.length) {
                        if (useProxy) {
                            data.sources = data.sources.map((s: any) => ({ 
                                ...s, 
                                url: proxyUrl(s.url, proxyBase),
                                originalUrl: s.url 
                            }));
                            if (data.subtitles) {
                                data.subtitles = data.subtitles.map((sub: any) => ({
                                    ...sub,
                                    url: proxyUrl(sub.url, proxyBase)
                                }));
                            }
                        }
                        return c.json({ ...data, server });
                    }
                }

                // Try fallback servers
                if (tryAll && !server) {
                    const servers = ['hd-2', 'hd-1', 'hd-3'];
                    for (const srv of servers) {
                        try {
                            const data = await sourceManager.getStreamingLinks(episodeId, srv, category);
                            if (data.sources?.length) {
                                if (useProxy) {
                                    data.sources = data.sources.map((s: any) => ({ 
                                        ...s, 
                                        url: proxyUrl(s.url, proxyBase),
                                        originalUrl: s.url 
                                    }));
                                    if (data.subtitles) {
                                        data.subtitles = data.subtitles.map((sub: any) => ({
                                            ...sub,
                                            url: proxyUrl(sub.url, proxyBase)
                                        }));
                                    }
                                }
                                return c.json({ ...data, server: srv, triedServers: servers });
                            }
                        } catch (e) { 
                            continue; 
                        }
                    }
                }

                return c.json({ 
                    sources: [], 
                    subtitles: [],
                    error: 'No streaming sources found',
                    suggestion: 'All servers failed. Please try again later.'
                });
            }
            return c.json({ sources: [], subtitles: [] });
        } catch (e: any) {
            return c.json({ error: e.message, sources: [], subtitles: [] }, 500);
        }
    });

    // Proxy endpoint
    app.get('/proxy', async (c) => {
        const url = c.req.query('url');
        if (!url) return c.json({ error: 'URL is required' }, 400);

        const proxyBase = getProxyBaseUrl(c);

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': new URL(url).origin,
                    'Origin': new URL(url).origin
                }
            });

            if (!response.ok) {
                return c.json({ error: 'Upstream error', status: response.status }, response.status as any);
            }

            const contentType = response.headers.get('content-type') || '';
            const newHeaders = new Headers(response.headers);
            newHeaders.set('Access-Control-Allow-Origin', '*');
            newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
            newHeaders.set('Access-Control-Allow-Headers', 'Range, Origin, Accept');

            // Rewrite m3u8 if needed
            if (contentType.includes('mpegurl') || url.includes('.m3u8')) {
                const text = await response.text();
                const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
                
                const rewritten = text.split('\n').map(line => {
                    const trimmed = line.trim();
                    
                    // Handle URI in tags
                    if (trimmed.includes('URI="')) {
                        return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
                            const absoluteUri = uri.startsWith('http') ? uri : `${baseUrl}${uri}`;
                            return `URI="${proxyUrl(absoluteUri, proxyBase)}"`;
                        });
                    }
                    
                    // Handle segment URLs
                    if (trimmed && !trimmed.startsWith('#')) {
                        const absoluteUrl = trimmed.startsWith('http') ? trimmed : `${baseUrl}${trimmed}`;
                        return proxyUrl(absoluteUrl, proxyBase);
                    }
                    
                    return line;
                }).join('\n');

                return c.body(rewritten, 200, {
                    'Content-Type': 'application/vnd.apple.mpegurl',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'private, max-age=5'
                });
            }

            // Stream other content
            return new Response(response.body, {
                status: response.status,
                headers: newHeaders
            });
        } catch (e: any) {
            return c.json({ error: 'Proxy failed', message: e.message }, 502);
        }
    });

    // CORS preflight
    app.options('/proxy', (c) => {
        return c.text('', 204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, Origin, Accept',
            'Access-Control-Max-Age': '86400'
        });
    });

    return app;
}
