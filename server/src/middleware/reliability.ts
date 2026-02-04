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

// Default circuit breaker settings
const DEFAULT_CIRCUIT_SETTINGS = {
    maxFailures: 5,
    resetTime: 30000, // 30 seconds
    timeout: 15000 // 15 second timeout
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

// Retry mechanism with exponential backoff
export async function retry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 1000,
    context?: any
): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await fn();
            return result;
        } catch (error) {
            if (attempt === maxAttempts) {
                throw error;
            }

            logger.retryAttempt(
                context?.operation || 'unknown',
                attempt,
                maxAttempts,
                delay
            );

            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }

    throw new Error('Max retries exceeded');
}

// Timeout decorator
export function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = DEFAULT_CIRCUIT_SETTINGS.timeout,
    context?: any
): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            setTimeout(() => {
                const error = new Error(`${context?.operation || 'Operation'} timed out after ${timeoutMs}ms`);
                logger.requestTimeout(context?.operation || 'unknown', timeoutMs, context);
                reject(error);
            }, timeoutMs);
        })
    ]);
}

// Circuit breaker decorator
export function withCircuitBreaker<T>(
    sourceName: string,
    fn: () => Promise<T>,
    context?: any
): Promise<T> {
    if (isCircuitBreakerOpen(sourceName)) {
        throw new Error(`Circuit breaker is open for ${sourceName}`);
    }

    return fn().then(result => {
        recordSuccess(sourceName);
        return result;
    }).catch(error => {
        recordFailure(sourceName);
        throw error;
    });
}

// Comprehensive reliability wrapper with circuit breaker, timeout, and retries
export async function reliableRequest<T>(
    sourceName: string,
    operation: string,
    fn: () => Promise<T>,
    options: {
        maxAttempts?: number;
        timeout?: number;
        retryDelay?: number;
        context?: any;
    } = {}
): Promise<T> {
    const {
        maxAttempts = 3,
        timeout = DEFAULT_CIRCUIT_SETTINGS.timeout,
        retryDelay = 1000,
        context = {}
    } = options;

    const requestContext = {
        ...context,
        sourceName,
        operation
    };

    try {
        return await retry(
            () => withCircuitBreaker(
                sourceName,
                () => withTimeout(fn(), timeout, requestContext),
                requestContext
            ),
            maxAttempts,
            retryDelay,
            requestContext
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

// Express middleware for reliability
export function reliabilityMiddleware(req: Request, res: Response, next: NextFunction) {
    const context = createRequestContext(req);
    const timer = new PerformanceTimer('API Request', context);

    // Handle response timing and errors
    res.on('finish', () => {
        const duration = timer.end();

        // Log request duration with details
        logger.performance('API Request', duration, {
            ...context,
            statusCode: res.statusCode,
            duration
        });

        // Log slow requests
        if (duration > 2000) {
            logger.slowOperation('API Request', duration, 2000, {
                ...context,
                statusCode: res.statusCode
            });
        }

        // Log errors
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

    // Add reliability utilities to request object
    (req as any).reliableRequest = reliableRequest;
    (req as any).retry = retry;
    (req as any).withTimeout = withTimeout;
    (req as any).withCircuitBreaker = withCircuitBreaker;

    next();
}

// Health check endpoint middleware
export function healthCheckMiddleware(req: Request, res: Response) {
    const sources = Array.from(circuitBreakers.keys());
    const circuitStates = Array.from(circuitBreakers.entries()).map(([name, state]) => ({
        name,
        state: state.state,
        failureCount: state.failureCount,
        lastAttemptTime: new Date(state.lastAttemptTime).toISOString(),
        lastFailureTime: state.lastFailureTime ? new Date(state.lastFailureTime).toISOString() : null,
        resetTime: state.resetTime
    }));

    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        sources: sources.length,
        circuitBreakers: circuitStates,
        activeRequests: (global as any).activeRequests || 0,
        memory: process.memoryUsage()
    });
}

export { getCircuitBreaker, isCircuitBreakerOpen, recordSuccess, recordFailure };
