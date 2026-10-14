import { readFile } from 'node:fs/promises';

/** Production is constrained by default, even when a database is configured. */
export const LOW_MEMORY_PROFILE = process.env.LOW_MEMORY_PROFILE === 'true' ||
    (process.env.LOW_MEMORY_PROFILE !== 'false' && process.env.NODE_ENV === 'production');

const configuredLimit = Number(process.env.MEMORY_LIMIT_MB);
export const MEMORY_LIMIT_MB = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 512;

async function cgroupNumber(path: string): Promise<number | null> {
    try {
        const text = (await readFile(path, 'utf8')).trim();
        const value = Number(text);
        return text && Number.isFinite(value) && value >= 0 ? value : null;
    } catch {
        return null;
    }
}

/** Sample on demand; no timer, Chromium inspection, or browser launch. */
export async function runtimeMemoryStats() {
    const [currentBytes, peakBytes, limitBytes] = process.platform === 'linux'
        ? await Promise.all([
            cgroupNumber('/sys/fs/cgroup/memory.current'),
            cgroupNumber('/sys/fs/cgroup/memory.peak'),
            cgroupNumber('/sys/fs/cgroup/memory.max'),
        ]) : [null, null, null];
    return {
        lowMemoryProfile: LOW_MEMORY_PROFILE,
        configuredLimitBytes: MEMORY_LIMIT_MB * 1024 * 1024,
        node: {
            ...process.memoryUsage(),
            // Node reports resourceUsage.maxRSS in KiB on every supported platform.
            peakRssBytes: process.resourceUsage().maxRSS * 1024,
            cpuMicroseconds: process.cpuUsage(),
        },
        // Includes the Rust data plane and every child, unlike Node's RSS alone.
        container: { currentBytes, peakBytes, limitBytes },
    };
}
