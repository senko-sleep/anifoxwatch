/**
 * Browser-side: same discovery order as server — GET `/api/hianime-rest/episode/servers` then merge
 * with static fallback before hitting `/episode/sources`.
 */
function normalizeExplicitForRest(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const lower = raw.trim().toLowerCase();
    if (lower === 'vidstreaming') return 'megacloud';
    if (lower === 'hd-3') return 'hd-2';
    return lower;
}

const FALLBACK = [
    'megacloud',
    'vidsrc',
    't-cloud',
    'hd-1',
    'hd-2',
    'streamsb',
    'streamtape',
] as const;

function mapEpisodeServerLabelToApiParam(label: string): string {
    const s = label.replace(/\s+/g, '').toLowerCase();
    if (s.includes('vidstreaming') || s === 'hd-1' || s === 'hd1') return 'hd-1';
    if (s.includes('vidcloud') || s === 'hd-2' || s === 'hd2') return 'hd-2';
    if (s.includes('megacloud') || s.includes('mega')) return 'megacloud';
    if (s.includes('streamsb') || (s.length <= 4 && s.includes('sb'))) return 'streamsb';
    if (s.includes('streamtape') || s.includes('tape')) return 'streamtape';
    if (s.includes('vidsrc')) return 'vidsrc';
    if (s.includes('t-cloud') || s.includes('tcloud')) return 't-cloud';
    return s.replace(/[^a-z0-9-]/g, '') || 'hd-1';
}

function extractIds(
    data: { sub?: Array<{ serverName?: string }>; dub?: Array<{ serverName?: string }> } | undefined,
    category: 'sub' | 'dub'
): string[] {
    const rows = category === 'dub' ? data?.dub : data?.sub;
    if (!Array.isArray(rows)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of rows) {
        const name = row?.serverName;
        if (typeof name !== 'string' || !name.trim()) continue;
        const id = mapEpisodeServerLabelToApiParam(name);
        if (!seen.has(id)) {
            seen.add(id);
            out.push(id);
        }
    }
    return out;
}

export async function fetchHianimeEpisodeServerIdsFromBff(
    apiBase: string,
    episodeId: string,
    category: 'sub' | 'dub',
    timeoutMs: number
): Promise<string[] | null> {
    const qs = new URLSearchParams({ animeEpisodeId: episodeId });
    const url = `${apiBase.replace(/\/$/, '')}/api/hianime-rest/episode/servers?${qs}`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
            mode: 'cors',
        });
        clearTimeout(tid);
        if (!resp.ok) return null;
        const body = (await resp.json()) as {
            status?: number;
            data?: { sub?: Array<{ serverName?: string }>; dub?: Array<{ serverName?: string }> };
        };
        if (body?.status !== undefined && body.status !== 200) return null;
        const ids = extractIds(body?.data, category);
        return ids.length > 0 ? ids : null;
    } catch {
        clearTimeout(tid);
        return null;
    }
}

export function buildBffServersToTry(opts: {
    explicitServer?: string;
    discoveredIds?: string[] | null;
}): string[] {
    const rawPref = opts.explicitServer?.trim();
    const pref =
        rawPref !== undefined && rawPref !== '' ? normalizeExplicitForRest(rawPref) : undefined;
    const discovered = opts.discoveredIds?.filter(Boolean) ?? [];
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (s: string) => {
        if (!s || seen.has(s)) return;
        seen.add(s);
        out.push(s);
    };
    if (pref) add(pref);
    for (const s of discovered) add(s);
    for (const s of FALLBACK) add(s);
    return out.length > 0 ? out : [...FALLBACK];
}
