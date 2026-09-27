/**
 * End-to-end checks for the watch page, run in a real browser against the dev stack
 * (`npm run dev`: web on :8081, API on :3001).
 *
 *   npm run test:e2e
 *
 * 1. Resume   — playback picks up where you left off, per episode.
 * 2. Identity — the anime you clicked is the anime that plays.
 * 3. Seasons  — `?s=` in the URL selects (and reports) the right season.
 *
 * 4. Live     — a real episode gets a real, playable source (no mocks).
 *
 * Resume tests serve the local MP4 in tests/ as the episode's stream, so they test our
 * player and history code rather than whichever upstream CDN is up today. They need the
 * dev server's /local route, so they're skipped when pointed at production:
 *
 *   E2E_WEB=https://anifoxwatch.web.app E2E_API=https://<api host> npm run test:e2e
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const WEB = process.env.E2E_WEB ?? 'http://localhost:8081';
const API = process.env.E2E_API ?? 'http://localhost:3001';
const LOCAL_MP4 = `${WEB}/local/naruto-ep1-full.mp4`;
const IS_DEV = /localhost|127\.0\.0\.1/.test(WEB);

// Spy x Family's franchise, in watch order. AniList ids are stable.
const SPY_S1 = { id: 140960, slug: 'spy-x-family-140960' };
const SPY_S2 = { id: 158927, slug: 'spy-x-family-season-2-158927' };
// A franchise with one AniList entry per season. (Spy x Family's first season is two
// entries on AniList, so its `?s=2` is "Part 2" — see the season tests.)
const KAGUYA_S1 = { id: 101921, slug: 'kaguya-sama-love-is-war-101921' };
const KAGUYA_S2 = { id: 112641, slug: 'kaguya-sama-love-is-war-112641' };

let browser;
before(async () => {
  for (const url of [WEB, `${API}/api/health`]) {
    const ok = await fetch(url).then((r) => r.ok, () => false);
    assert.ok(ok, `${url} is not reachable — start the dev stack with \`npm run dev\``);
  }
  browser = await chromium.launch();
});
after(() => browser?.close());

/** A fresh profile (empty history) whose episode streams are the local MP4. */
async function pageWithLocalStream() {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/api/stream/watch/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        sources: [{ url: LOCAL_MP4, isM3U8: false, isDirect: true, quality: 'auto', category: 'sub' }],
        subtitles: [],
        source: 'e2e-local',
      }),
    }),
  );
  return page;
}

const watchUrl = (slug, ep, season) => `${WEB}/watch/anime/${slug}?ep=${ep}${season ? `&s=${season}` : ''}`;

async function waitForVideo(page) {
  await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 1, null, { timeout: 60_000 });
}

/** Play muted from `seconds` until the player has saved a position at or past it. */
async function watchUntil(page, seconds) {
  await waitForVideo(page);
  await page.evaluate((t) => {
    const v = document.querySelector('video');
    v.muted = true;
    v.currentTime = t;
    return v.play();
  }, seconds);
  await page.waitForFunction(
    (t) => Object.keys(localStorage).some((k) => k.startsWith('video-position-') && parseFloat(localStorage.getItem(k)) >= t),
    seconds,
    { timeout: 30_000 },
  );
  await page.evaluate(() => document.querySelector('video').pause());
}

const currentTime = (page) => page.evaluate(() => document.querySelector('video')?.currentTime ?? -1);

/** Settle the page on its final URL and title (slug resolution and `?s=` rewrites run async). */
async function settle(page) {
  // While loading, the title is "Watch — AniFox"; the anime's own title replaces it.
  await page.waitForFunction(
    () => document.title && !/^(watch|anifox)(\s*[—-]\s*anifox)?$/i.test(document.title.trim()),
    null,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(2_500);
}

const query = (page) => new URL(page.url()).searchParams;

// The app paces its own AniList calls; these add to the same rate limit, so ask once per id.
const titleCache = new Map();
async function anilistTitles(id) {
  if (!titleCache.has(id)) titleCache.set(id, fetchTitles(id));
  return titleCache.get(id);
}
async function fetchTitles(id) {
  // Through the API's AniList proxy (cached), retrying when AniList rate-limits.
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${API}/api/anilist/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: `{ Media(id:${id}) { title { english romaji } synonyms } }` }),
    });
    const media = res.ok ? (await res.json())?.data?.Media : null;
    if (media) return [media.title.english, media.title.romaji, ...media.synonyms].filter(Boolean);
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  throw new Error(`AniList never returned media ${id}`);
}
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// ─────────────────────────────────────────────────────────────────────────────

describe('resume playback', { skip: !IS_DEV && 'needs the dev server /local route' }, () => {
  test('reloading an episode resumes where you left off', async () => {
    const page = await pageWithLocalStream();
    await page.goto(watchUrl(SPY_S1.slug, 2));
    await watchUntil(page, 300);

    await page.reload();
    await waitForVideo(page);
    await page.waitForFunction(() => document.querySelector('video').currentTime >= 290, null, { timeout: 15_000 });
    const t = await currentTime(page);
    assert.ok(t >= 295 && t < 330, `expected to resume near 5:00, got ${t.toFixed(1)}s`);
    await page.context().close();
  });

  test('Continue Watching reopens the same episode at the same spot', async () => {
    const page = await pageWithLocalStream();
    await page.goto(watchUrl(SPY_S1.slug, 3));
    await watchUntil(page, 420);

    await page.goto(WEB);
    const card = page.locator('.resume-card-link').first();
    await card.waitFor({ timeout: 30_000 });
    await card.click();

    await page.waitForURL(/\/watch\/anime\//, { timeout: 30_000 });
    await waitForVideo(page);
    await page.waitForFunction(() => document.querySelector('video').currentTime >= 410, null, { timeout: 15_000 });
    assert.equal(query(page).get('ep'), '3', `card opened ${page.url()}`);
    await page.context().close();
  });

  test('progress is kept per episode, not shared across episodes', async () => {
    const page = await pageWithLocalStream();
    await page.goto(watchUrl(SPY_S1.slug, 4));
    await watchUntil(page, 600);

    await page.goto(watchUrl(SPY_S1.slug, 5));
    await waitForVideo(page);
    await page.waitForTimeout(3_000);
    const t = await currentTime(page);
    assert.ok(t < 60, `episode 5 inherited episode 4's position (${t.toFixed(1)}s)`);
    await page.context().close();
  });

  test('an embed-only episode still lands in Continue Watching at the right episode', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // An embed page is what FlixCloud-backed sources return; we can't read its clock.
    await page.route('**/api/stream/watch/**', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ sources: [{ url: 'https://flixcloud.cc/e/e2e?v=1', isM3U8: false, isDirect: true, quality: 'auto', category: 'sub' }], subtitles: [] }),
      }),
    );
    await page.route('https://flixcloud.cc/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>embed</p>' }));
    await page.goto(watchUrl(SPY_S1.slug, 6));
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('anistream_watch_history') || '[]').some((h) => h.episodeNumber === 6),
      null,
      { timeout: 60_000 },
    );
    const [entry] = await page.evaluate(() => JSON.parse(localStorage.getItem('anistream_watch_history')));
    assert.equal(entry.episodeNumber, 6);
    assert.equal(entry.progress, 0);
    await context.close();
  });
});

describe('the anime you clicked is the anime that plays', () => {
  for (const { slug, id } of [
    SPY_S1,
    SPY_S2,
    { slug: 'attack-on-titan-16498', id: 16498 },
    { slug: 'your-name-21519', id: 21519 },
    // Short AniList ids: "one piece 21" used to fuzzy-match the one-episode Episode of Merry special.
    { slug: 'one-piece-21', id: 21 },
    // A title that ends in a number must not be read as Aniwaves show #100.
    { slug: 'mob-psycho-100', id: 21507 },
  ]) {
    test(`${slug} plays AniList ${id}`, async () => {
      const page = await pageWithLocalStream();
      const streams = [];
      page.on('request', (r) => r.url().includes('/api/stream/watch/') && streams.push(new URL(r.url())));

      await page.goto(watchUrl(slug, 1));
      await settle(page);

      const expected = await anilistTitles(id);
      const shown = await page.title();
      assert.ok(
        expected.some((t) => norm(t) === norm(shown)),
        `page shows "${shown}", expected one of ${JSON.stringify(expected)}`,
      );

      assert.ok(streams.length > 0, 'no stream was requested');
      // Later requests are the player prefetching the next episode.
      const req = streams[0];
      assert.equal(req.searchParams.get('ep_num'), '1', `stream asked for episode ${req.searchParams.get('ep_num')}`);
      const titleParam = req.searchParams.get('title');
      if (titleParam) assert.equal(norm(titleParam), norm(shown), `stream was requested for "${titleParam}"`);
      await page.context().close();
    });
  }

  test('clicking a title on the home page plays that title', async () => {
    const page = await pageWithLocalStream();
    await page.goto(WEB);
    const card = page.locator('section.home-shelf a[href^="/anime/"]').first();
    await card.waitFor({ timeout: 60_000 });
    const clicked = (await card.locator('img').first().getAttribute('alt'))?.trim();
    assert.ok(clicked, 'first card has no title');

    await card.click();
    await page.waitForURL(/\/anime\//);
    const begin = page.locator('a[href^="/watch/anime/"]').first();
    await begin.waitFor({ timeout: 60_000 });
    await begin.click();
    await page.waitForURL(/\/watch\/anime\//, { timeout: 30_000 });
    await settle(page);

    assert.equal(norm(await page.title()), norm(clicked), `clicked "${clicked}", watch page shows "${await page.title()}"`);
    await page.context().close();
  });
});

describe('season in the URL', () => {
  test('a season entry without ?s= gets its season written into the URL', async () => {
    const page = await pageWithLocalStream();
    await page.goto(watchUrl(SPY_S1.slug, 1));
    await page.waitForFunction(() => new URL(location.href).searchParams.has('s'), null, { timeout: 60_000 });
    assert.equal(query(page).get('s'), '1');
    assert.equal(query(page).get('ep'), '1');
    await page.context().close();
  });

  test('?s=2 switches to season 2 and keeps the episode', async () => {
    const page = await pageWithLocalStream();
    await page.goto(watchUrl(KAGUYA_S1.slug, 4, 2));
    // Needs the franchise chain from AniList first, which is slow when it's rate-limiting.
    await page.waitForFunction((id) => location.pathname.endsWith(`-${id}`), KAGUYA_S2.id, { timeout: 90_000 });
    await settle(page);

    assert.equal(query(page).get('s'), '2');
    assert.equal(query(page).get('ep'), '4');
    const expected = await anilistTitles(KAGUYA_S2.id);
    const shown = await page.title();
    assert.ok(expected.some((t) => norm(t) === norm(shown)), `season 2 URL shows "${shown}"`);
    await page.context().close();
  });

  test('seasons count AniList entries, so a split cour is its own season', async () => {
    // Spy x Family S1 is two AniList entries; `?s=2` lands on the second half.
    const page = await pageWithLocalStream();
    await page.goto(watchUrl(SPY_S1.slug, 1, 2));
    await page.waitForFunction(() => location.pathname.endsWith('-142838'), null, { timeout: 60_000 });
    assert.equal(query(page).get('s'), '2');
    await page.context().close();
  });

  test('?s= matching the current season leaves the page alone', async () => {
    const page = await pageWithLocalStream();
    await page.goto(watchUrl(SPY_S2.slug, 1, 2));
    await settle(page);
    const where = `ended on ${page.url()} ("${await page.title()}")`;
    assert.match(page.url(), new RegExp(SPY_S2.slug), where);
    assert.equal(query(page).get('s'), '2', where);
    await page.context().close();
  });

  test('an out-of-range ?s= is ignored instead of breaking the page', async () => {
    const page = await pageWithLocalStream();
    await page.goto(watchUrl(SPY_S1.slug, 1, 99));
    await settle(page);
    assert.match(page.url(), new RegExp(SPY_S1.slug));
    const expected = await anilistTitles(SPY_S1.id);
    const shown = await page.title();
    assert.ok(expected.some((t) => norm(t) === norm(shown)), `s=99 shows "${shown}"`);
    await page.context().close();
  });
});

describe('live playback (real sources, no mocks)', () => {
  test('One Piece lists its full run, not one special', async () => {
    const { id } = await fetch(`${API}/api/anime/resolve-slug?slug=one-piece-21&mode=safe`).then((r) => r.json());
    assert.equal(id, 'anilist-21');
    const { episodes } = await fetch(`${API}/api/anime/episodes?id=${id}`).then((r) => r.json());
    assert.ok(episodes.length > 1000, `One Piece has ${episodes.length} episodes`);
  });

  for (const slug of ['one-piece-21', 'spy-x-family-140960']) {
    test(`${slug} episode 1 gets a playable source on the page`, async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const streams = [];
      page.on('response', (r) => r.url().includes('/api/stream/watch/') && streams.push(r.status()));

      await page.goto(watchUrl(slug, 1));
      await page.waitForFunction(
        () => document.querySelector('iframe[src^="http"], video[src], video source')
          || /No source for this episode/.test(document.body.innerText),
        null,
        { timeout: 120_000 },
      );
      const body = await page.locator('body').innerText();
      assert.doesNotMatch(body, /No source for this episode/, `streams: ${streams.join(',')}`);
      assert.ok(streams.includes(200), `stream responses: ${streams.join(',') || 'none'}`);
      await context.close();
    });
  }
});
