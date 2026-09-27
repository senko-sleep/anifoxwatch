import { randomUUID } from 'node:crypto';

const contexts = new Map<string, { url: string; headers: Record<string, string>; expires: number }>();
export function saveMediaContext(url: string, headers: Record<string, string>): string {
    const now = Date.now();
    for (const [id, context] of contexts) if (context.expires < now) contexts.delete(id);
    if (contexts.size >= 10000) contexts.delete(contexts.keys().next().value!);
    const id = randomUUID();
    contexts.set(id, { url, headers, expires: now + 2 * 60 * 60 * 1000 });
    return id;
}

export function getMediaContext(id: string, url: string): Record<string, string> | undefined {
    const context = contexts.get(id);
    if (!context || context.url !== url || context.expires < Date.now()) return undefined;
    return context.headers;
}

export function childMediaHeaders(headers: Record<string, string>, parent: string, child: string): Record<string, string> {
    if (new URL(parent).origin === new URL(child).origin) return headers;
    return Object.fromEntries(Object.entries(headers).filter(([key]) => !/^(cookie|authorization)$/i.test(key)));
}
