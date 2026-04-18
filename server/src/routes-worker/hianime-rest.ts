/**
 * Optional HTTP backend for HiAnime data (e.g. self-hosted aniwatch-api on Vercel).
 * When `HIANIME_REST_URL` is set on the Worker, routes prefer this over in-worker scraping.
 */

export function getHianimeRestBase(env: unknown): string | undefined {
    if (!env || typeof env !== "object") return undefined;
    const v = (env as Record<string, unknown>).HIANIME_REST_URL;
    if (typeof v === "string" && v.trim()) return v.replace(/\/$/, "");
    return undefined;
}

/** aniwatch-api wraps payloads as `{ status, data }` — returns `data` or null. */
export async function fetchHianimeRestData<T>(
    base: string,
    pathWithLeadingSlash: string,
    timeoutMs = 25_000
): Promise<T | null> {
    const path = pathWithLeadingSlash.startsWith("/")
        ? pathWithLeadingSlash
        : `/${pathWithLeadingSlash}`;
    const url = `${base}${path}`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
        });
        clearTimeout(tid);
        if (!resp.ok) return null;
        const body = (await resp.json()) as { status?: number; data?: T };
        if (body?.data === undefined || body?.data === null) return null;
        return body.data as T;
    } catch {
        clearTimeout(tid);
        return null;
    }
}
