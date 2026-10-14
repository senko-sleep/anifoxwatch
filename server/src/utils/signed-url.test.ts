import { describe, expect, it } from 'vitest';
import { cacheTtlForUrls, signedUrlExpiry } from './signed-url.js';

const now = Date.UTC(2026, 9, 14, 12, 0, 0);
const inSeconds = (s: number) => Math.floor((now + s * 1000) / 1000);

describe('signedUrlExpiry', () => {
    it('reads unix-seconds and unix-ms expiry parameters', () => {
        expect(signedUrlExpiry(`https://cdn.example/a.m3u8?expires=${inSeconds(600)}`, now)).toBe(now + 600_000);
        expect(signedUrlExpiry(`https://cdn.example/a.m3u8?Exp=${now + 300_000}`, now)).toBe(now + 300_000);
    });

    it('reads Akamai hdnts and S3 V4 signatures', () => {
        expect(signedUrlExpiry(`https://cdn.example/a?hdnts=st=1~exp=${inSeconds(120)}~acl=/*~hmac=ab`, now)).toBe(now + 120_000);
        expect(signedUrlExpiry('https://b.s3.amazonaws.com/a?X-Amz-Date=20261014T115000Z&X-Amz-Expires=900', now))
            .toBe(Date.UTC(2026, 9, 14, 11, 50, 0) + 900_000);
    });

    it('ignores values that are not plausible timestamps', () => {
        expect(signedUrlExpiry('https://play.echovideo.ru/x?h=-1116596478&e=pa&n=1878438387725929', now)).toBeUndefined();
        expect(signedUrlExpiry('https://cdn.example/a?e=12', now)).toBeUndefined();
        expect(signedUrlExpiry('https://cdn.example/a?expires=99999999999', now)).toBeUndefined(); // ~5138 AD
        expect(signedUrlExpiry('not a url', now)).toBeUndefined();
    });
});

describe('cacheTtlForUrls', () => {
    it('keeps the default for URLs with no readable expiry', () => {
        expect(cacheTtlForUrls(['https://cdn.example/opaque/token'], 900_000, now)).toBe(900_000);
    });

    it('ends a minute before the earliest expiry', () => {
        const urls = [`https://a.example/x?expires=${inSeconds(300)}`, `https://b.example/y?expires=${inSeconds(3600)}`];
        expect(cacheTtlForUrls(urls, 900_000, now)).toBe(240_000);
    });

    it('refuses to cache a link that is expired or about to be', () => {
        expect(cacheTtlForUrls([`https://a.example/x?expires=${inSeconds(30)}`], 900_000, now)).toBe(0);
        expect(cacheTtlForUrls([`https://a.example/x?expires=${inSeconds(-600)}`], 900_000, now)).toBe(0);
    });
});
