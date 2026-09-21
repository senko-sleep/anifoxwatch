/**
 * One pace for every AniList request this process makes.
 *
 * AniList allows roughly 90 requests a minute per IP and answers 429 beyond it. Several
 * services here talk to it (the anime catalog, the adult catalog, the browser proxy), and
 * a limit that is counted per service adds up to well over the real one — so the pace is
 * shared, process-wide, rather than owned by any of them.
 *
 * A slot is reserved synchronously and only then awaited, so callers arriving together
 * each take a different one. A counter that is read before it is written (`if (used <
 * limit) { await …; used++ }`) lets a whole burst through at once, which is the failure
 * this replaces.
 */

/** ~85 requests a minute: under AniList's ceiling, so the usual case never has to back off. */
const GAP_MIN = 700;
const GAP_MAX = 6000;

let gap = GAP_MIN;
let nextStart = 0;
let clean = 0;

/** Wait for this request's turn. */
export async function anilistSlot(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, nextStart);
    nextStart = at + gap; // reserved before the await, so concurrent callers can't share a slot
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

/** Report a 429 (or a 5xx): everything slows down until answers come back clean. */
export function anilistThrottled(retryAfterSec?: number): void {
    clean = 0;
    gap = Math.min(GAP_MAX, Math.max(gap * 2, (retryAfterSec ?? 0) * 200));
}

/** Report a clean answer. After a stretch of them the pace eases back up. */
export function anilistOk(): void {
    if (++clean >= 12) {
        clean = 0;
        gap = Math.max(GAP_MIN, Math.round(gap * 0.75));
    }
}

/** Current spacing in ms — for logging and tests. */
export const anilistGap = (): number => gap;
