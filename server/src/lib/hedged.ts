/**
 * Hedged requests: start the preferred task alone, and start the next one only when the running
 * ones fail or have gone `delayMs` without an answer. The first success wins and aborts the rest.
 *
 * On a healthy upstream this costs exactly one task; on a slow or broken one it costs the delay
 * instead of the full timeout of every task tried in turn.
 */
export function hedged<T>(tasks: Array<(signal: AbortSignal) => Promise<T>>, delayMs: number, parent?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
    return new Promise<T>((resolve, reject) => {
        const errors: unknown[] = [];
        let next = 0, pending = 0, settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            parent?.removeEventListener('abort', onAbort);
            controller.abort(new Error('Hedged task settled'));
            fn();
        };
        const onAbort = () => finish(() => reject(parent!.reason ?? new Error('Aborted')));
        const launch = () => {
            clearTimeout(timer);
            if (settled) return;
            if (next >= tasks.length) {
                if (pending === 0) finish(() => reject(new AggregateError(errors, 'All hedged tasks failed')));
                return;
            }
            const task = tasks[next++];
            pending++;
            Promise.resolve().then(() => task(signal)).then(
                value => finish(() => resolve(value)),
                error => { pending--; errors.push(error); launch(); },
            );
            if (next < tasks.length) timer = setTimeout(launch, delayMs);
        };
        if (parent?.aborted) return onAbort();
        parent?.addEventListener('abort', onAbort, { once: true });
        launch();
    });
}
