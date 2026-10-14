/**
 * Upstream media hosts rotate (MegaVid alone has moved echovideo.to → dpopdrop89.store), so
 * media URLs are validated by what they are — public web addresses whose bytes probe as media —
 * not by a host allowlist. This rejects the addresses no CDN uses and an open proxy must never
 * fetch: loopback, private, link-local (cloud metadata), CGNAT and unique-local ranges.
 */
const PRIVATE_V4 = [
    [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16],
    [0xac100000, 12], [0xc0a80000, 16], [0xe0000000, 3],
] as const;

function isPrivateV4(host: string): boolean {
    const parts = host.split('.');
    if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || +p > 255)) return false;
    const ip = parts.reduce((n, p) => (n << 8) + +p, 0) >>> 0;
    return PRIVATE_V4.some(([base, bits]) => (ip >>> (32 - bits)) === (base >>> (32 - bits)));
}

export function isPublicHttpUrl(input: string | URL, httpsOnly = false): boolean {
    let url: URL;
    try { url = typeof input === 'string' ? new URL(input) : input; } catch { return false; }
    if (url.protocol !== 'https:' && (httpsOnly || url.protocol !== 'http:')) return false;
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!host || host === 'localhost' || /\.(localhost|local|internal|home\.arpa)$/.test(host)) return false;
    if (host.startsWith('[')) {
        // Any bracketed IPv6 literal: no media CDN is addressed this way, and mapped/ULA/link-local
        // forms are too many to enumerate safely.
        return false;
    }
    if (/^[\d.]+$/.test(host)) return !isPrivateV4(host);
    // Decimal/hex/octal integer hosts ("2130706433", "0x7f.1") are normalised to dotted form by
    // WHATWG URL parsing, so the check above already sees them as IPv4.
    return true;
}
