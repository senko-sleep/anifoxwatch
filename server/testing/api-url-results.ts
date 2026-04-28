/**
 * Live API checks: prints full request URLs, HTTP status, full response bodies (no truncation),
 * and every URL string found in responses (JSON walk + loose https?:// scan).
 *
 * Usage:
 *   STREAM_TEST_BASE=https://anifoxwatch.vercel.app npx tsx server/testing/api-url-results.ts
 *   npx tsx server/testing/api-url-results.ts https://127.0.0.1:3001
 *
 * Output: single JSON object to stdout (use `> results.json` to save).
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadBaseFromEnvFile(): string {
    const candidates = [
        join(__dirname, '../../.env.production'),
        join(__dirname, '../.env.production'),
    ];
    for (const p of candidates) {
        if (!existsSync(p)) continue;
        const text = readFileSync(p, 'utf-8');
        const m = text.match(/^\s*VITE_API_URL\s*=\s*(\S+)/m);
        if (m?.[1]) return m[1].trim().replace(/\/$/, '');
    }
    return '';
}

/** Build the same probe URLs as smoke-streaming (plus explicit list for transparency). */
export function buildApiTestRequestUrls(base: string): { name: string; requestUrl: string }[] {
    const b = base.replace(/\/$/, '');
    const out: { name: string; requestUrl: string }[] = [
        { name: 'health', requestUrl: `${b}/health` },
        { name: 'api_health', requestUrl: `${b}/api/health` },
        {
            name: 'anime_search_hianime',
            requestUrl: `${b}/api/anime/search?q=one%20piece&page=1&source=hianime`,
        },
    ];

    const watch = new URL(`${b}/api/stream/watch/steinsgate-3`);
    watch.searchParams.set('ep', '230');
    watch.searchParams.set('category', 'sub');
    out.push({ name: 'stream_watch_steinsgate', requestUrl: watch.toString() });

    const proxy = new URL(`${b}/api/hianime-rest/episode/sources`);
    proxy.searchParams.set('animeEpisodeId', 'steinsgate-3?ep=230');
    proxy.searchParams.set('server', 'megacloud');
    proxy.searchParams.set('category', 'sub');
    out.push({ name: 'hianime_rest_sources', requestUrl: proxy.toString() });

    return out;
}

const URL_IN_TEXT = /\bhttps?:\/\/[^\s"'<>]+/gi;

function collectUrlsFromText(text: string, into: Set<string>): void {
    let m: RegExpExecArray | null;
    const re = new RegExp(URL_IN_TEXT.source, URL_IN_TEXT.flags);
    while ((m = re.exec(text)) !== null) {
        let u = m[0];
        u = u.replace(/[),.;]+$/, '');
        into.add(u);
    }
}

function collectUrlsFromJson(value: unknown, into: Set<string>): void {
    if (value === null || value === undefined) return;
    if (typeof value === 'string') {
        collectUrlsFromText(value, into);
        if (/^https?:\/\//i.test(value)) into.add(value);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) collectUrlsFromJson(item, into);
        return;
    }
    if (typeof value === 'object') {
        for (const v of Object.values(value as Record<string, unknown>)) {
            collectUrlsFromJson(v, into);
        }
    }
}

export interface ApiUrlTestResult {
    name: string;
    requestUrl: string;
    status: number;
    ok: boolean;
    contentType: string | null;
    responseBody: string;
    urlsFromResponse: string[];
}

async function fetchOne(
    name: string,
    requestUrl: string
): Promise<ApiUrlTestResult> {
    const res = await fetch(requestUrl, {
        headers: { Accept: 'application/json', 'User-Agent': 'anifoxwatch-api-url-results/1.0' },
    });
    const contentType = res.headers.get('content-type');
    const body = await res.text();
    const fromJson = new Set<string>();
    try {
        collectUrlsFromJson(JSON.parse(body), fromJson);
    } catch {
        /* not JSON */
    }
    collectUrlsFromText(body, fromJson);
    const urlsFromResponse = [...fromJson].sort();

    return {
        name,
        requestUrl,
        status: res.status,
        ok: res.ok,
        contentType,
        responseBody: body,
        urlsFromResponse,
    };
}

async function main(): Promise<void> {
    const base =
        (process.env.STREAM_TEST_BASE || process.argv[2] || '').replace(/\/$/, '') ||
        loadBaseFromEnvFile();

    if (!base) {
        console.error(
            'Set STREAM_TEST_BASE, pass base URL as argv[1], or add VITE_API_URL to .env.production'
        );
        process.exit(1);
    }

    const requests = buildApiTestRequestUrls(base);
    const results: ApiUrlTestResult[] = [];

    for (const { name, requestUrl } of requests) {
        results.push(await fetchOne(name, requestUrl));
    }

    const report = {
        generatedAt: new Date().toISOString(),
        baseUrl: base,
        testingRequestUrls: requests.map((r) => ({ name: r.name, requestUrl: r.requestUrl })),
        results,
    };

    console.log(JSON.stringify(report, null, 2));
}

// Avoid running live fetches (and process.exit) when Vitest imports this module for unit tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
