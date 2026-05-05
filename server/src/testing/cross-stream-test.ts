type Category = 'sub' | 'dub';

type Episode = { id: string; number?: number; title?: string };

type StreamResponse = {
  sources?: Array<{
    url: string;
    quality?: string;
    isM3U8?: boolean;
    isEmbed?: boolean;
    ipLocked?: boolean;
    isDirect?: boolean;
    source?: string;
    server?: string;
  }>;
  subtitles?: Array<{ url: string; lang: string }>;
  source?: string;
  warning?: string;
  dubFallback?: boolean;
  triedServers?: string[];
};

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function nowIso() {
  return new Date().toISOString();
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; data?: T; text?: string; ms: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    const ms = Date.now() - started;
    clearTimeout(tid);
    const text = await resp.text();
    try {
      const data = JSON.parse(text) as T;
      return { ok: resp.ok, status: resp.status, data, ms };
    } catch {
      return { ok: resp.ok, status: resp.status, text, ms };
    }
  } catch (e) {
    const ms = Date.now() - started;
    clearTimeout(tid);
    return { ok: false, status: 0, text: e instanceof Error ? e.message : String(e), ms };
  }
}

async function main() {
  const apiBase = (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, '');
  const anilist = argValue('--anilist') || argValue('--id') || '';
  const epStr = argValue('--ep') || '1';
  const epNum = Math.max(1, parseInt(epStr, 10) || 1);
  const timeoutMs = Math.max(5_000, parseInt(argValue('--timeout-ms') || '45000', 10) || 45_000);
  const want: Category[] = (argValue('--cat')?.split(',').map((s) => s.trim().toLowerCase()) as Category[] | undefined) ?? ['sub', 'dub'];

  if (!/^\d+$/.test(anilist)) {
    console.error('Usage: tsx src/testing/cross-stream-test.ts --anilist 199221 --ep 1');
    process.exit(2);
  }

  const anilistId = `anilist-${anilist}`;
  const report: any = {
    at: nowIso(),
    apiBase,
    input: { anilistId, epNum, categories: want, timeoutMs },
    resolve: null as any,
    episodes: null as any,
    streams: [] as any[],
  };

  // 1) Resolve AniList -> streamingId
  const resolveUrl = `${apiBase}/api/anime/resolve?id=${encodeURIComponent(anilistId)}`;
  const resolved = await fetchJson<{ id: string; streamingId: string }>(resolveUrl, Math.min(timeoutMs, 15_000));
  report.resolve = { url: resolveUrl, ...resolved };
  if (!resolved.ok || !resolved.data?.streamingId) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // 2) Get episodes
  const episodesUrl = `${apiBase}/api/anime/episodes?id=${encodeURIComponent(resolved.data.streamingId)}`;
  const eps = await fetchJson<{ episodes: Episode[] }>(episodesUrl, Math.min(timeoutMs, 25_000));
  report.episodes = { url: episodesUrl, ...eps };
  const list = eps.data?.episodes || [];
  const episode = list.find((e) => (e.number ?? -1) === epNum) || list[epNum - 1];
  if (!episode?.id) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // 3) Stream watch (sub/dub)
  for (const cat of want) {
    const watchUrl =
      `${apiBase}/api/stream/watch/${encodeURIComponent(episode.id)}` +
      `?category=${encodeURIComponent(cat)}` +
      `&ep_num=${encodeURIComponent(String(epNum))}` +
      `&anilist_id=${encodeURIComponent(String(anilist))}`;

    const r = await fetchJson<StreamResponse>(watchUrl, timeoutMs);
    const sources = r.data?.sources || [];
    report.streams.push({
      category: cat,
      url: watchUrl,
      ...r,
      summary: {
        sources: sources.length,
        first: sources[0]
          ? {
              quality: sources[0].quality,
              isM3U8: sources[0].isM3U8,
              isEmbed: sources[0].isEmbed,
              ipLocked: sources[0].ipLocked,
              server: sources[0].server,
            }
          : null,
        warning: r.data?.warning,
        dubFallback: r.data?.dubFallback,
      },
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

