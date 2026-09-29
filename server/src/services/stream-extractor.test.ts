import { beforeEach, describe, expect, it, vi } from 'vitest';

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('puppeteer', () => ({ default: { launch } }));

import { streamExtractor } from './stream-extractor.js';

describe('StreamExtractor browser lifecycle', () => {
    beforeEach(() => {
        launch.mockReset();
        launch.mockResolvedValue({
            connected: true,
            once: vi.fn(),
            version: vi.fn().mockResolvedValue('Chrome/test'),
        });
    });

    it('shares one Chromium launch across concurrent first requests', async () => {
        const probes = await Promise.all([
            streamExtractor.probe(), streamExtractor.probe(), streamExtractor.probe(),
        ]);

        expect(launch).toHaveBeenCalledTimes(1);
        expect(probes.every(probe => probe.ok)).toBe(true);
    });
});
