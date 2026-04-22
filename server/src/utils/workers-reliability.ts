/**
 * Cloudflare Workers Reliability Utility
 * Provides retry logic, circuit breaker, and timeout protection for Workers runtime
 * Similar to Express reliability middleware but adapted for Workers (no Node.js dependencies)
 */

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

// Default circuit breaker settings - optimized for speed
const DEFAULT_CIRCUIT_SETTINGS = {
    maxFailures: 5, // Allow more failures before tripping - prevents transient errors from killing sources
    resetTime: 15000, // 15s recovery - fast enough to recover from brief outages
    timeout: 25000 // 25s timeout — Vercel allows 60s; sources need time on cold starts
};

// Get or create circuit breaker for a source
export function getCircuitBreaker(sourceName: string): CircuitBreakerState {
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
            console.log(`[CircuitBreaker] ${sourceName} moved to half-open state`);
        }
    }

    return circuit;
}

// Update circuit breaker state on failure
export function recordFailure(sourceName: string) {
    const circuit = getCircuitBreaker(sourceName);
    circuit.failureCount++;
    circuit.lastFailureTime = Date.now();
    circuit.lastAttemptTime = Date.now();

    if (circuit.failureCount >= circuit.maxFailures) {
        circuit.state = 'open';
        console.warn(`[CircuitBreaker] ${sourceName} tripped after ${circuit.failureCount} failures`);
    }
}

// Update circuit breaker state on success
export function recordSuccess(sourceName: string) {
    const circuit = getCircuitBreaker(sourceName);
    circuit.failureCount = 0;
    circuit.lastAttemptTime = Date.now();

    if (circuit.state !== 'closed') {
        circuit.state = 'closed';
        console.log(`[CircuitBreaker] ${sourceName} reset to closed state`);
    }
}

// Check if circuit breaker is allow to make requests
export function isCircuitBreakerOpen(sourceName: string): boolean {
    const circuit = getCircuitBreaker(sourceName);
    return circuit.state === 'open';
}

/**
 * Retry an operation with exponential backoff
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    initialDelay: number = 1000,
    context?: string
): Promise<T> {
    let lastError: Error | null = null;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt === maxAttempts) {
                throw lastError;
            }

            console.log(`[Retry] ${context || 'operation'} attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms`);

            // Wait with exponential backoff
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }

    throw lastError || new Error('Max retries exceeded');
}

/**
 * Wrap a promise with a timeout
 */
export async function withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number = DEFAULT_CIRCUIT_SETTINGS.timeout,
    context?: string
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            const error = new Error(`${context || 'Operation'} timed out after ${timeoutMs}ms`);
            console.error(`[Timeout] ${context || 'operation'} timed out after ${timeoutMs}ms`);
            reject(error);
        }, timeoutMs);

        fn().then(
            (result) => {
                clearTimeout(timeoutId);
                resolve(result);
            },
            (error) => {
                clearTimeout(timeoutId);
                reject(error);
            }
        );
    });
}

/**
 * Wrap an operation with circuit breaker logic
 */
export async function withCircuitBreaker<T>(
    sourceName: string,
    fn: () => Promise<T>,
    context?: string
): Promise<T> {
    if (isCircuitBreakerOpen(sourceName)) {
        throw new Error(`Circuit breaker for ${sourceName} is OPEN. Request rejected.`);
    }

    try {
        const result = await fn();
        recordSuccess(sourceName);
        return result;
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const isAbort = err.name === 'AbortError' || 
                       err.message === 'Aborted' || 
                       err.message.includes('timeout') || 
                       err.message.includes('timed out') ||
                       err.message.includes('Circuit breaker');
        
        if (!isAbort) {
            recordFailure(sourceName);
        }
        throw err;
    }
}

/**
 * Perform a reliable request with retries, circuit breaker, and timeout
 */
export async function reliableRequest<T>(
    sourceName: string,
    operation: string,
    fn: () => Promise<T>,
    options: {
        maxAttempts?: number;
        timeout?: number;
        retryDelay?: number;
    } = {}
): Promise<T> {
    const {
        maxAttempts = 2, // 1 retry for transient failures
        timeout = 25000, // 25s timeout — sources need time, especially on Vercel cold starts
        retryDelay = 1000,
    } = options;

    const context = `${sourceName}:${operation}`;

    try {
        return await retryWithBackoff(
            () => withCircuitBreaker(
                sourceName,
                () => withTimeout(() => fn(), timeout, context),
                context
            ),
            maxAttempts,
            retryDelay,
            context
        );
    } catch (error) {
        console.error(`[Reliability] ${operation} failed for ${sourceName}:`, error);
        throw error;
    }
}

/**
 * Get circuit breaker states for health monitoring
 */
export function getCircuitBreakerStates() {
    return Array.from(circuitBreakers.entries()).map(([name, state]) => ({
        name,
        state: state.state,
        failureCount: state.failureCount,
        lastAttemptTime: new Date(state.lastAttemptTime).toISOString(),
        lastFailureTime: state.lastFailureTime ? new Date(state.lastFailureTime).toISOString() : null,
        resetTimeRemaining: state.state === 'open'
            ? Math.max(0, DEFAULT_CIRCUIT_SETTINGS.resetTime - (Date.now() - (state.lastFailureTime || 0)))
            : 0
    }));
}

/**
 * Reset a specific circuit breaker (for manual recovery)
 */
export function resetCircuitBreaker(sourceName: string) {
    const circuit = circuitBreakers.get(sourceName);
    if (circuit) {
        circuit.state = 'closed';
        circuit.failureCount = 0;
        console.log(`[CircuitBreaker] ${sourceName} manually reset`);
    }
}
