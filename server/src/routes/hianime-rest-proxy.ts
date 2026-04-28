import { Router, Request, Response } from 'express';
import { fetchConsumetHianimeEpisodeSourcesEnvelope } from '../utils/hianime-consumet-local.js';
import {
    fetchLocalAniwatchEpisodeSourcesJson,
    fetchLocalEpisodeServersEnvelope,
} from '../utils/hianime-local-aniwatch.js';
import { normalizeAnimeEpisodeIdForHianimeRest } from '../utils/hianime-rest-servers.js';

function getHianimeRestBase(): string | undefined {
    const v = process.env.HIANIME_REST_URL;
    if (typeof v === 'string' && v.trim()) return v.replace(/\/$/, '');
    return undefined;
}

/** True when upstream returned HTTP 200 and JSON `{ status: 200, data }` (aniwatch-api shape). */
function upstreamJsonLooksSuccessful(fetchResp: { ok: boolean }, text: string): boolean {
    if (!fetchResp.ok) return false;
    try {
        const j = JSON.parse(text) as { status?: number; data?: unknown };
        return j.status === 200 && j.data !== undefined;
    } catch {
        return false;
    }
}

const router = Router();

router.get('/episode/servers', async (req: Request, res: Response) => {
    // Disable caching - always fetch fresh data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const raw = req.query.animeEpisodeId;
    if (typeof raw !== 'string' || !raw.trim()) {
        res.status(400).json({ status: 400, error: 'animeEpisodeId required' });
        return;
    }
    const animeEpisodeId = normalizeAnimeEpisodeIdForHianimeRest(raw.trim());

    const base = getHianimeRestBase();
    if (base) {
        const qs = new URLSearchParams();
        qs.set('animeEpisodeId', animeEpisodeId);
        const url = `${base}/api/v2/hianime/episode/servers?${qs}`;
        try {
            const resp = await fetch(url, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
            });
            const text = await resp.text();
            if (upstreamJsonLooksSuccessful(resp, text)) {
                res.status(200);
                res.set('Content-Type', 'application/json; charset=utf-8');
                res.send(text);
                return;
            }
        } catch {
            // fall through to local
        }
    }

    const local = await fetchLocalEpisodeServersEnvelope(animeEpisodeId);
    if (local) {
        res.status(200).json(local);
        return;
    }
    res.status(200).json({
        status: 200,
        data: {
            episodeId: animeEpisodeId,
            episodeNo: 0,
            sub: [{ serverName: 'VidStreaming' }, { serverName: 'MegaCloud' }],
            dub: [{ serverName: 'VidStreaming' }, { serverName: 'MegaCloud' }],
        },
        degraded: true,
        message: 'Episode server list unavailable; returned static placeholders for discovery.',
    });
});

router.get('/episode/sources', async (req: Request, res: Response) => {
    // Disable caching - always fetch fresh data for streaming
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const rawEp = req.query.animeEpisodeId;
    if (typeof rawEp !== 'string' || !rawEp.trim()) {
        res.status(400).json({ status: 400, error: 'animeEpisodeId required' });
        return;
    }
    const animeEpisodeId = normalizeAnimeEpisodeIdForHianimeRest(rawEp.trim());
    const server = typeof req.query.server === 'string' && req.query.server ? req.query.server : 'hd-1';
    const category = typeof req.query.category === 'string' && req.query.category ? req.query.category : 'sub';

    const base = getHianimeRestBase();
    if (base) {
        const qs = new URLSearchParams();
        qs.set('animeEpisodeId', animeEpisodeId);
        qs.set('server', server);
        qs.set('category', category);
        const url = `${base}/api/v2/hianime/episode/sources?${qs}`;
        try {
            const resp = await fetch(url, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
            });
            const text = await resp.text();
            if (upstreamJsonLooksSuccessful(resp, text)) {
                res.status(200);
                res.set('Content-Type', 'application/json; charset=utf-8');
                res.send(text);
                return;
            }
        } catch {
            // fall through to local
        }
    }

    // Prefer Consumet before aniwatch npm: same mirrors, but aniwatch axios often hangs past Promise.race.
    const consumet = await fetchConsumetHianimeEpisodeSourcesEnvelope({
        animeEpisodeId,
        server,
        category,
        timeoutMs: 16_000,
    });
    if (consumet) {
        res.status(200).json(consumet);
        return;
    }

    const local = await fetchLocalAniwatchEpisodeSourcesJson({
        animeEpisodeId,
        server,
        category,
        timeoutMs: 14_000,
    });
    if (local) {
        res.status(200).json(local);
        return;
    }

    // Serverless egress / Cloudflare often breaks scrapers; return 200 + empty data so clients
    // (and api-url-results `response.ok`) don't see a hard 502 — Watch page still shows "no sources".
    res.status(200).json({
        status: 200,
        data: {
            sources: [],
            subtitles: [],
            headers: { Referer: 'https://aniwatchtv.to/' },
        },
        degraded: true,
        message:
            'No sources extracted (upstream HiAnime REST, Consumet, and aniwatch npm all failed). Retry from a non-serverless host or check mirror availability.',
    });
});

export default router;
