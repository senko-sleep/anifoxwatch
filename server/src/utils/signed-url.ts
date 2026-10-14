/**
 * Signed media URLs carry their own expiry. A cache that outlives it hands the player a link
 * the CDN will refuse, so cache lifetimes are capped by what the URLs themselves say.
 *
 * Only readable expiries count: a numeric unix timestamp in a known parameter (`expires=…`,
 * `exp=…`, Akamai's `hdnts=exp=…`), or S3-style `X-Amz-Date` + `X-Amz-Expires`. Opaque tokens
 * (most anime CDNs) give no expiry, and the caller's default TTL applies. Values that are not
 * plausible timestamps (`e=pa`) are ignored rather than guessed at.
 */

const EXPIRY_PARAMS = ['expires', 'expire', 'expiry', 'exp', 'e', 'x-expires', 'validto', 'deadline'];
const YEAR_MS = 365 * 24 * 3600_000;

/** A numeric value as epoch milliseconds, if it is a plausible near-term timestamp. */
function asTimestamp(raw: string, now: number): number | undefined {
    if (!/^\d{9,13}$/.test(raw)) return undefined;
    const n = Number(raw);
    const ms = raw.length >= 13 ? n : n * 1000;
    return ms > now - YEAR_MS && ms < now + YEAR_MS ? ms : undefined;
}

/** When this URL stops working (epoch ms), or undefined when it does not say. */
export function signedUrlExpiry(url: string, now = Date.now()): number | undefined {
    let parsed: URL;
    try { parsed = new URL(url); } catch { return undefined; }
    const params = new Map<string, string>();
    parsed.searchParams.forEach((value, key) => params.set(key.toLowerCase(), value));

    for (const key of EXPIRY_PARAMS) {
        const value = params.get(key);
        const at = value ? asTimestamp(value, now) : undefined;
        if (at) return at;
    }

    // Akamai token auth: hdnts=st=…~exp=…~acl=…~hmac=…
    const hdnts = params.get('hdnts') ?? params.get('__token__');
    const akamai = hdnts?.match(/(?:^|~)exp=(\d+)/)?.[1];
    if (akamai) {
        const at = asTimestamp(akamai, now);
        if (at) return at;
    }

    // S3 / GCS V4 signatures: signed at X-Amz-Date, valid for X-Amz-Expires seconds.
    const date = params.get('x-amz-date') ?? params.get('x-goog-date');
    const ttl = params.get('x-amz-expires') ?? params.get('x-goog-expires');
    if (date && ttl && /^\d+$/.test(ttl)) {
        const m = date.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
        if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + Number(ttl) * 1000;
    }
    return undefined;
}

/**
 * How long a result built from these URLs may be cached: the default, shortened so it ends
 * `marginMs` before the earliest URL expires. 0 means do not cache (already expired or too close).
 */
export function cacheTtlForUrls(urls: Iterable<string>, defaultTtlMs: number, now = Date.now(), marginMs = 60_000): number {
    let ttl = defaultTtlMs;
    for (const url of urls) {
        const expiry = signedUrlExpiry(url, now);
        if (expiry !== undefined) ttl = Math.min(ttl, expiry - now - marginMs);
    }
    return Math.max(0, ttl);
}
