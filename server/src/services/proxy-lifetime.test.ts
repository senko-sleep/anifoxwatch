import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { proxyLifetime } from './proxy-lifetime.js';

const pair = () => {
    const req = new EventEmitter() as Request;
    const res = Object.assign(new EventEmitter(), {
        headersSent: false, destroyed: false, set: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(), json: vi.fn(), destroy: vi.fn(),
    }) as unknown as Response;
    return { req, res };
};
afterEach(() => { vi.useRealTimers(); });

describe('media proxy lifecycle', () => {
    it('bounds the entire attempt chain, rather than resetting each retry budget', () => {
        vi.useFakeTimers();
        const { req, res } = pair();
        const lifetime = proxyLifetime(req, res, 1000);
        vi.advanceTimersByTime(600);
        expect(lifetime.remaining()).toBe(400);
        vi.advanceTimersByTime(400);
        expect(lifetime.signal.aborted).toBe(true);
        expect(res.status).toHaveBeenCalledWith(504);
        expect(req.listenerCount('aborted')).toBe(0);
        expect(res.listenerCount('close')).toBe(0);
    });
    it('cancels upstream streams on a client disconnect and releases the deadline', () => {
        vi.useFakeTimers();
        const { req, res } = pair();
        const lifetime = proxyLifetime(req, res, 1000);
        res.emit('close');
        expect(lifetime.signal.aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
        expect(res.status).not.toHaveBeenCalled();
    });
    it('allows long progressive playback while retaining disconnect cancellation', () => {
        vi.useFakeTimers();
        const { req, res } = pair();
        const lifetime = proxyLifetime(req, res, 1000);
        lifetime.streaming();
        vi.advanceTimersByTime(60_000);
        expect(lifetime.signal.aborted).toBe(false);
        res.emit('close');
        expect(lifetime.signal.aborted).toBe(true);
    });
});
