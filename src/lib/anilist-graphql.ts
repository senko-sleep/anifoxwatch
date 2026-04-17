/**
 * Shared AniList GraphQL access: one-at-a-time pacing + 429 retry.
 * Prevents concurrent browser calls from tripping public rate limits (~90 req/min).
 */

export const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';

const MIN_SPACING_MS = 850;
const MAX_429_RETRIES = 5;

let queue: Promise<unknown> = Promise.resolve();

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get('retry-after');
  if (!raw) return null;
  const sec = parseInt(raw, 10);
  if (!Number.isNaN(sec)) return sec * 1000;
  const when = Date.parse(raw);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return null;
}

async function fetchWith429Retry(init: RequestInit): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(ANILIST_GRAPHQL_URL, init);
    if (res.status !== 429) return res;
    if (attempt >= MAX_429_RETRIES) return res;

    const waitMs = retryAfterMs(res) ?? Math.min(45_000, 1800 * 2 ** attempt);
    await delay(waitMs);
    attempt++;
  }
}

/**
 * Serialize all AniList GraphQL POSTs and space them apart to stay under rate limits.
 */
export function fetchAniListGraphQL(body: Record<string, unknown>): Promise<Response> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  };

  const run = queue.then(() => fetchWith429Retry(init));
  queue = run.finally(() => delay(MIN_SPACING_MS));
  return run;
}
