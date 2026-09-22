import { Request, Response, NextFunction } from 'express';
import { logger, createRequestContext, PerformanceTimer } from '../utils/logger.js';

// Circuit Breaker state
interface CircuitBreakerState {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    lastFailureTime: number;
    lastAttemptTime: number;
    resetTime: number; // Time to wait before trying again in ms
    maxFailures: number;
}

// Circuit Breaker configuration per source
const circuitBreakers = new Map<string, CircuitBreakerState>();

// Default circuit breaker settings - optimized for reliability with slow sources
const DEFAULT_CIRCUIT_SETTINGS = {
    maxFailures: 8, // Increased from 5 to 8 to prevent false positives from transient issues
    resetTime: 10000, // Reduced from 15s to 10s for faster recovery
    timeout: 90000 // 90s timeout — increased significantly for slow sources and Vercel cold starts
};

// Get or create circuit breaker for a source
function getCircuitBreaker(sourceName: string): CircuitBreakerState {
    let circuit = circuitBreakers.get(sourceName);
    if (!circuit) {
        circuit = {
            state: 'closed',
            failureCount: 0,
            lastFailureTime: 0,
            lastAttemptTime: 0,
            resetTime: DEFAULT_CIRCUIT_SETTINGS.resetTime,
            maxFailures: DEFAULT_CIRCUIT_SETTINGS.maxFailures
        };
        circuitBreakers.set(sourceName, circuit);
    }

    // Check if we should reset the circuit
    if (circuit.state === 'open') {
        const now = Date.now();
        if (now - circuit.lastFailureTime > circuit.resetTime) {
            circuit.state = 'half-open';
            logger.circuitBreakerReset(sourceName);
        }
    }

    return circuit;
}

// Update circuit breaker state on failure
function recordFailure(sourceName: string) {
    const circuit = getCircuitBreaker(sourceName);
    circuit.failureCount++;
    circuit.lastFailureTime = Date.now();
    circuit.lastAttemptTime = Date.now();

    // Only trip after repeated failures (avoid comparing to lastFailureTime set in this same call).
    if (circuit.failureCount >= circuit.maxFailures) {
        circuit.state = 'open';
        logger.circuitBreakerTripped(
            sourceName,
            circuit.failureCount,
            circuit.resetTime
        );
    }
}

// Update circuit breaker state on success
function recordSuccess(sourceName: string) {
    const circuit = getCircuitBreaker(sourceName);
    circuit.failureCount = 0;
    circuit.lastAttemptTime = Date.now();

    if (circuit.state !== 'closed') {
        circuit.state = 'closed';
        logger.circuitBreakerReset(sourceName);
    }
}

// Check if circuit breaker is allow to make requests
function isCircuitBreakerOpen(sourceName: string): boolean {
    const circuit = getCircuitBreaker(sourceName);
    return circuit.state === 'open';
}

/**
 * Retry an operation with exponential backoff and support for cancellation
 */
export async function retry<T>(
    fn: (signal?: AbortSignal) => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 1000,
    context?: any,
    parentSignal?: AbortSignal
): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (parentSignal?.aborted) throw new Error('Aborted');

        try {
            return await fn(parentSignal);
        } catch (error) {
            lastError = error;

            if (attempt === maxAttempts || (error instanceof Error && (error.name === 'AbortError' || error.message === 'Aborted'))) {
                throw error;
            }

            logger.retryAttempt(
                context?.operation || 'unknown',
                attempt,
                maxAttempts,
                delay
            );

            // Wait with support for cancellation
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(resolve, delay);
                parentSignal?.addEventListener('abort', () => {
                    clearTimeout(timeout);
                    reject(new Error('Aborted'));
                }, { once: true });
            });

            delay *= 2;
        }
    }

    throw lastError || new Error('Max retries exceeded');
}

/**
 * Wrap a promise with a timeout that includes proper cancellation via AbortSignal
 */
export async function withTimeout<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number = DEFAULT_CIRCUIT_SETTINGS.timeout,
    context?: any,
    parentSignal?: AbortSignal
): Promise<T> {
    const controller = new AbortController();
    const { signal } = controller;

    const onAbort = () => controller.abort();
    if (parentSignal) {
        if (parentSignal.aborted) {
            controller.abort();
            throw new Error('Aborted');
        }
        parentSignal.addEventListener('abort', onAbort, { once: true });
    }

    // AbortSignal is cooperative: browser launches and a few upstream clients do
    // not observe it. Race with a rejecting timer too, otherwise a logged timeout
    // can still leave the request pending forever.
    let timeoutId: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            const error = new Error(`${context?.operation || 'Operation'} timed out after ${timeoutMs}ms`);
            logger.requestTimeout(context?.operation || 'unknown', timeoutMs, context);
            controller.abort();
            reject(error);
        }, timeoutMs);
        timeoutId.unref?.();
    });

    try {
        return await Promise.race([fn(signal), timeout]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (parentSignal) {
            parentSignal.removeEventListener('abort', onAbort);
        }
    }
}

/**
 * Wrap an operation with circuit breaker logic
 */
export async function withCircuitBreaker<T>(
    sourceName: string,
    fn: () => Promise<T>,
    context?: any
): Promise<T> {
    if (isCircuitBreakerOpen(sourceName)) {
        throw new Error(`Circuit breaker for ${sourceName} is OPEN. Request rejected.`);
    }

    try {
        const result = await fn();
        recordSuccess(sourceName);
        return result;
    } catch (error) {
        const isAbort = error instanceof Error && (
            error.name === 'AbortError' || 
            error.message === 'Aborted' || 
            error.message.includes('timeout') || 
            error.message.includes('timed out') ||
            error.message.includes('Circuit breaker')
        );
        if (!isAbort) {
            recordFailure(sourceName);
        }
        throw error;
    }
}

/**
 * Perform a reliable request with retries, circuit breaker, and timeout
 */
export async function reliableRequest<T>(
    sourceName: string,
    operation: string,
    fn: (signal: AbortSignal) => Promise<T>,
    options: {
        maxAttempts?: number;
        timeout?: number;
        retryDelay?: number;
        context?: any;
        signal?: AbortSignal;
    } = {}
): Promise<T> {
    const {
        maxAttempts = 2, // 1 retry for transient failures - prevents single blips from cascading
        timeout = 25000, // 25s timeout — sources need time, especially on Vercel cold starts
        retryDelay = 1000,
        context: extraContext = {},
        signal: parentSignal
    } = options;

    const requestContext = {
        sourceName,
        operation,
        ...extraContext,
        startTime: Date.now()
    };

    try {
        return await retry(
            (signal) => withCircuitBreaker(
                sourceName,
                () => withTimeout(
                    (timeoutSignal) => fn(timeoutSignal),
                    timeout,
                    requestContext,
                    signal
                ),
                requestContext
            ),
            maxAttempts,
            retryDelay,
            requestContext,
            parentSignal
        );
    } catch (error) {
        logger.error(
            `${operation} failed for ${sourceName}`,
            error as Error,
            requestContext
        );
        throw error;
    }
}

/**
 * Express middleware for reliability and performance monitoring
 */
export function reliabilityMiddleware(req: Request, res: Response, next: NextFunction) {
    const context = createRequestContext(req);
    const timer = new PerformanceTimer('API Request', context);

    res.on('finish', () => {
        const duration = timer.end();

        logger.performance('API Request', duration, {
            ...context,
            statusCode: res.statusCode,
            duration
        });

        if (duration > 2000) {
            logger.slowOperation('API Request', duration, 2000, {
                ...context,
                statusCode: res.statusCode
            });
        }

        if (res.statusCode >= 400) {
            logger.error(
                `API Error ${res.statusCode}`,
                undefined,
                {
                    ...context,
                    statusCode: res.statusCode,
                    duration
                }
            );
        }
    });

    (req as any).reliableRequest = reliableRequest;
    (req as any).retry = retry;

    next();
}

/**
 * Health check endpoint middleware to expose circuit breaker states
 */
export function healthCheckMiddleware(req: Request, res: Response) {
    const circuits = Array.from(circuitBreakers.entries()).map(([name, state]) => ({
        name,
        state: state.state,
        failureCount: state.failureCount,
        lastAttemptTime: new Date(state.lastAttemptTime).toISOString(),
        lastFailureTime: state.lastFailureTime ? new Date(state.lastFailureTime).toISOString() : null,
        resetTimeRemaining: state.state === 'open'
            ? Math.max(0, DEFAULT_CIRCUIT_SETTINGS.resetTime - (Date.now() - (state.lastFailureTime || 0)))
            : 0
    }));

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        circuits
    });
}

/**
 * Force reset a circuit breaker for a specific source (useful for manual recovery)
 */
export function forceResetCircuitBreaker(sourceName: string): void {
    const circuit = circuitBreakers.get(sourceName);
    if (circuit) {
        circuit.state = 'closed';
        circuit.failureCount = 0;
        circuit.lastFailureTime = 0;
        circuit.lastAttemptTime = 0;
        logger.info(`[CircuitBreaker] Force reset for ${sourceName}`);
    }
}

export { getCircuitBreaker, isCircuitBreakerOpen, recordSuccess, recordFailure };

/**
 * Await a fan-out, but bound the wait by a deadline instead of by the slowest member.
 *
 * `Promise.all` over N sources makes the user pay for max(latency), and the retry/timeout policy
 * around each source puts that maximum at tens of seconds. Latency that high is indistinguishable
 * from failure to whoever is waiting, and the irony is that the answer is usually already in hand:
 * the fast sources returned in a few hundred milliseconds and the request sat on them.
 *
 * So: settle what has arrived by `deadlineMs` and return that. Stragglers are not cancelled —
 * they run to completion and populate their per-source caches, so the straggler that missed this
 * deadline is what makes the next request fast. This is the standard tail-tolerance trade (Dean &
 * Barroso, *The Tail at Scale*): serve a slightly less complete answer now rather than a complete
 * one long after the user gave up.
 *
 * @param label       Identifies the fan-out in the log line emitted when a deadline is missed.
 * @param tasks       The fan-out. Each must settle on its own; rejections count as "arrived empty".
 * @param deadlineMs  How long the caller is willing to wait in total.
 * @param fallback    Stand-in value for a task that has not settled in time.
 * @returns           Settled values in the original order, with `fallback` where one is late.
 */
export async function settleByDeadline<T>(
    label: string,
    tasks: Promise<T>[],
    deadlineMs: number,
    fallback: (index: number) => T
): Promise<{ values: T[]; lateCount: number }> {
    if (tasks.length === 0) return { values: [], lateCount: 0 };

    const values = new Array<T>(tasks.length);
    const arrived = new Array<boolean>(tasks.length).fill(false);
    let settledCount = 0;

    // Never let a straggler's own rejection escape as an unhandled rejection: this function
    // stops awaiting these promises at the deadline, so nothing else is left to catch them.
    const tracked = tasks.map((task, i) =>
        task.then(
            (value) => { values[i] = value; arrived[i] = true; settledCount++; },
            () => { arrived[i] = true; settledCount++; }
        )
    );

    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, deadlineMs);
        // Do not hold the event loop open purely to wait out a deadline.
        timer.unref?.();
    });

    try {
        await Promise.race([Promise.all(tracked), deadline]);
    } finally {
        if (timer) clearTimeout(timer);
    }

    let lateCount = 0;
    for (let i = 0; i < tasks.length; i++) {
        if (!arrived[i]) {
            values[i] = fallback(i);
            lateCount++;
        }
    }

    if (lateCount > 0) {
        logger.warn(
            `[${label}] Answered at the ${deadlineMs}ms deadline with ${settledCount}/${tasks.length} sources; ` +
            `${lateCount} still running (their results will warm the cache)`
        );
    }

    return { values, lateCount };
}
