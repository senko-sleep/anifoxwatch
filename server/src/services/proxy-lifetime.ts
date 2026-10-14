import type { Request, Response } from 'express';

/** One budget for all upstream attempts; downstream disconnects cancel the byte stream too. */
export function proxyLifetime(req: Request, res: Response, budgetMs: number) {
    const controller = new AbortController();
    const deadline = Date.now() + budgetMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearDeadline = () => { if (timer) clearTimeout(timer); timer = undefined; };
    const abort = () => controller.abort(new Error('Media client disconnected'));
    const cleanup = () => {
        clearDeadline();
        req.removeListener('aborted', abort);
        res.removeListener('close', closed);
        res.removeListener('finish', finished);
    };
    const closed = () => { abort(); cleanup(); };
    const finished = () => { abort(); cleanup(); };
    req.once('aborted', abort);
    res.once('close', closed);
    res.once('finish', finished);
    timer = setTimeout(() => {
        controller.abort(new Error('Media proxy deadline exceeded'));
        if (!res.headersSent && !res.destroyed) {
            res.set('Access-Control-Allow-Origin', '*').status(504).json({
                error: 'Media proxy deadline exceeded', reason: 'timeout', retryable: true,
            });
        } else if (!res.destroyed) res.destroy();
        cleanup();
    }, budgetMs);
    timer.unref?.();
    return {
        signal: controller.signal,
        remaining: () => Math.max(1, deadline - Date.now()),
        // A progressive MP4 may stream for an entire episode. Its socket idle
        // timeout takes over once response headers arrive; cancellation stays attached.
        streaming: clearDeadline,
    };
}
