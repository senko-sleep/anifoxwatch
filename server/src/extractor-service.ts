/**
 * The browser half of the API, run on its own (Google Cloud Run): everything that needs
 * Chromium, behind authenticated HTTP. The main API (Koyeb, 512MB) calls it through
 * RemoteStreamExtractor and never launches a browser itself.
 *
 *   POST /v1/extract-embed  { url, timeoutMs?, verifyPlayback?, bypassCache? } → ExtractionResult
 *   POST /v1/fetch-json     { url, timeoutMs?, headers? }                     → { value }
 *   POST /v1/source         { source: 'Anichi', method, args, timeoutMs? }     → { value }
 *   POST /v1/probe          {}                                                → { ok, version? }
 *   GET  /v1/stats          browser, memory, CPU and Chromium-process figures
 *   GET  /healthz           liveness only — never starts a browser
 *
 * Chromium starts on the first request that needs it and closes after BROWSER_IDLE_CLOSE_MS
 * without work; Cloud Run scales the instance to zero after that. Every /v1 route needs
 * `Authorization: Bearer $EXTRACTOR_TOKEN`; the service refuses to start without one.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { readdir, readFile } from 'node:fs/promises';

process.env.BROWSER_EXTRACTOR = 'local';
const { streamExtractor } = await import('./services/stream-extractor.js');
const { AnichiSource } = await import('./sources/anichi-source.js');

const TOKEN = process.env.EXTRACTOR_TOKEN?.trim() ?? '';
if (TOKEN.length < 32) {
    console.error('[extractor] EXTRACTOR_TOKEN must be set to a random secret of at least 32 characters');
    process.exit(1);
}
if (streamExtractor.mode !== 'local') {
    console.error(`[extractor] expected a local browser, got mode=${streamExtractor.mode}`);
    process.exit(1);
}
const local = streamExtractor as Extract<typeof streamExtractor, { mode: 'local' }>;

const MAX_TIMEOUT_MS = 45_000;
const ANICHI_METHODS = new Set(['search', 'getEpisodes', 'getStreamingLinks']);
const FORWARDED_HEADERS = new Set(['accept', 'accept-language', 'referer', 'origin']);
const anichi = new AnichiSource();
const started = Date.now();
const counters = { requests: 0, unauthorized: 0, rejectedUrls: 0, errors: 0 };

// ── Auth ───────────────────────────────────────────────────────────────────
const digest = (value: string) => createHash('sha256').update(value).digest();
const expected = digest(TOKEN);
function requireToken(req: Request, res: Response, next: NextFunction): void {
    const presented = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    // Hashing first makes the comparison constant-time regardless of the presented length.
    if (presented && timingSafeEqual(digest(presented), expected)) return next();
    counters.unauthorized++;
    res.status(401).json({ error: 'unauthorized' });
}

/** A request this service will not run — answered 400, and never counted as an outage. */
class BadRequest extends Error {}

// ── Outbound URL guard ─────────────────────────────────────────────────────
// The browser fetches what it is told to. Only public http(s) hosts are allowed, so a leaked
// token cannot point it at the instance metadata server or anything else inside Google's network.
function isPrivateAddress(address: string): boolean {
    if (address.includes(':')) {
        const a = address.toLowerCase();
        if (a.startsWith('::ffff:')) return isPrivateAddress(a.slice(7));
        return a === '::1' || a === '::' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80');
    }
    const [x, y] = address.split('.').map(Number);
    return x === 10 || x === 127 || x === 0 || (x === 169 && y === 254) || (x === 172 && y >= 16 && y <= 31) ||
        (x === 192 && y === 168) || (x === 100 && y >= 64 && y <= 127) || x >= 224;
}

async function assertPublicUrl(raw: unknown): Promise<string> {
    if (typeof raw !== 'string' || raw.length > 4096) throw new BadRequest('url must be a string');
    let url: URL;
    try { url = new URL(raw); } catch { throw new BadRequest('invalid url'); }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new BadRequest('only http(s) URLs');
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (host === 'localhost' || host.endsWith('.internal') || host.endsWith('.local')) throw new BadRequest('private host');
    const addresses = isIP(host) ? [host]
        : (await lookup(host, { all: true }).catch(() => { throw new BadRequest('host does not resolve'); })).map((a) => a.address);
    if (!addresses.length || addresses.some(isPrivateAddress)) throw new BadRequest('private host');
    return url.toString();
}

const timeoutOf = (value: unknown, fallback: number) =>
    Math.min(MAX_TIMEOUT_MS, Math.max(1_000, Number(value) || fallback));

/** Aborts when the caller hangs up, so an abandoned extraction frees its page at once. */
function callerSignal(res: Response): AbortSignal {
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(new Error('caller disconnected')); });
    return controller.signal;
}

// ── Measurements ───────────────────────────────────────────────────────────
/** Chromium processes on this (Linux) host and their resident memory, from /proc. */
async function chromiumProcesses(): Promise<{ count: number; rssMb: number } | null> {
    if (process.platform !== 'linux') return null;
    let count = 0;
    let rssKb = 0;
    for (const pid of await readdir('/proc').catch(() => [] as string[])) {
        if (!/^\d+$/.test(pid)) continue;
        try {
            const cmd = await readFile(`/proc/${pid}/cmdline`, 'utf8');
            if (!/chrom/i.test(cmd)) continue;
            const status = await readFile(`/proc/${pid}/status`, 'utf8');
            count++;
            rssKb += Number(status.match(/VmRSS:\s+(\d+)/)?.[1] ?? 0);
        } catch { /* process exited while being read */ }
    }
    return { count, rssMb: Math.round(rssKb / 1024) };
}

// ── App ────────────────────────────────────────────────────────────────────
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.get('/healthz', (_req, res) => { res.json({ ok: true, uptimeS: Math.round((Date.now() - started) / 1000) }); });

app.use('/v1', requireToken, (_req, _res, next) => { counters.requests++; next(); });

const handle = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
        const body = await fn(req, res);
        if (!res.headersSent) res.json(body);
    } catch (error: any) {
        if (res.headersSent) return;
        const message = String(error?.message ?? error);
        if (error instanceof BadRequest) {
            counters.rejectedUrls++;
            res.status(400).json({ error: message });
        } else {
            // The page or site failed, not this service: 422 keeps the caller's circuit closed.
            counters.errors++;
            res.status(422).json({ error: message.slice(0, 300) });
        }
    }
};

app.post('/v1/extract-embed', handle(async (req, res) => {
    const url = await assertPublicUrl(req.body?.url);
    return local.extractFromEmbed(url, timeoutOf(req.body?.timeoutMs, 20_000), req.body?.verifyPlayback === true,
        req.body?.bypassCache === true, callerSignal(res));
}));

app.post('/v1/fetch-json', handle(async (req, res) => {
    const url = await assertPublicUrl(req.body?.url);
    const headers = Object.fromEntries(Object.entries(req.body?.headers ?? {})
        .filter(([k, v]) => FORWARDED_HEADERS.has(k.toLowerCase()) && typeof v === 'string')) as Record<string, string>;
    const value = await local.fetchJsonInBrowser(url, { timeoutMs: timeoutOf(req.body?.timeoutMs, 20_000), headers, signal: callerSignal(res) });
    return { value };
}));

app.post('/v1/source', handle(async (req, res) => {
    const { source, method, args } = req.body ?? {};
    if (source !== 'Anichi' || !ANICHI_METHODS.has(method) || !Array.isArray(args) || args.length > 5) {
        throw new BadRequest('source method not allowed');
    }
    const options = { ...(args.at(-1) ?? {}), timeout: timeoutOf(req.body?.timeoutMs, 25_000), signal: callerSignal(res) };
    const value = await (anichi as any)[method](...args.slice(0, -1), options);
    return { value };
}));

app.post('/v1/probe', handle(async () => local.probe()));

app.get('/v1/stats', handle(async () => {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    return {
        uptimeS: Math.round((Date.now() - started) / 1000),
        node: { rssMb: Math.round(mem.rss / 1048576), heapMb: Math.round(mem.heapUsed / 1048576), cpuUserMs: Math.round(cpu.user / 1000), cpuSystemMs: Math.round(cpu.system / 1000) },
        chromium: await chromiumProcesses(),
        browser: local.stats(),
        ...counters,
    };
}));

const port = Number(process.env.PORT) || 8080;
const server = app.listen(port, () => console.log(`[extractor] listening on :${port}`));

// Cloud Run sends SIGTERM before scaling an instance away: close Chromium with it.
const shutdown = () => {
    server.close();
    void local.close().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 8_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
