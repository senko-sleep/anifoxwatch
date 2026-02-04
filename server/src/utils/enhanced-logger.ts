import chalk from 'chalk';

/**
 * Enhanced Logger with Metrics, Tracing, and Actionable Insights
 * Designed for production debugging on Render.com
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    FATAL = 4
}

export interface LogContext {
    source?: string;
    requestId?: string;
    userId?: string;
    ip?: string;
    userAgent?: string;
    duration?: number;
    statusCode?: number;
    error?: {
        message: string;
        name: string;
        stack?: string;
        code?: string;
    };
    metrics?: {
        memoryUsage?: NodeJS.MemoryUsage;
        cpuUsage?: NodeJS.CpuUsage;
        activeRequests?: number;
        queuedRequests?: number;
        cacheHitRate?: number;
    };
    [key: string]: unknown;
}

export interface PerformanceMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    slowRequests: number;
    errorRate: number;
    memoryUsageMB: number;
    uptime: number;
}

class EnhancedLogger {
    private static instance: EnhancedLogger;
    private logLevel: LogLevel = LogLevel.INFO;
    private metrics: Map<string, number[]> = new Map(); // Store response times per endpoint
    private errorCount: Map<string, number> = new Map(); // Track errors per type
    private requestCount = 0;
    private successCount = 0;
    private failureCount = 0;
    private slowRequestCount = 0;
    private startTime = Date.now();

    private constructor() {
        const envLevel = process.env.LOG_LEVEL?.toUpperCase();
        if (envLevel && envLevel in LogLevel) {
            this.logLevel = LogLevel[envLevel as keyof typeof LogLevel];
        }

        // Log metrics every 5 minutes in production
        if (process.env.NODE_ENV === 'production') {
            setInterval(() => this.logMetricsSummary(), 5 * 60 * 1000);
        }
    }

    public static getInstance(): EnhancedLogger {
        if (!EnhancedLogger.instance) {
            EnhancedLogger.instance = new EnhancedLogger();
        }
        return EnhancedLogger.instance;
    }

    private shouldLog(level: LogLevel): boolean {
        if (process.env.NODE_ENV !== 'production') {
            return level >= LogLevel.DEBUG;
        }
        return level >= this.logLevel;
    }

    private formatTimestamp(): string {
        return new Date().toISOString();
    }

    private getMemoryUsage(): { used: number; total: number; percentage: number } {
        const usage = process.memoryUsage();
        const total = usage.heapTotal;
        const used = usage.heapUsed;
        return {
            used: Math.round(used / 1024 / 1024),
            total: Math.round(total / 1024 / 1024),
            percentage: Math.round((used / total) * 100)
        };
    }

    private log(level: LogLevel, message: string, context?: LogContext, error?: Error) {
        if (!this.shouldLog(level)) return;

        const timestamp = this.formatTimestamp();
        const levelName = LogLevel[level];
        const memory = this.getMemoryUsage();

        // Build log entry
        const logEntry: any = {
            timestamp,
            level: levelName,
            message: message.replace(/\u001b\[\d+m/g, ''),
            memory: `${memory.used}MB/${memory.total}MB (${memory.percentage}%)`,
            ...context
        };

        if (error) {
            logEntry.error = {
                message: error.message,
                name: error.name,
                stack: error.stack?.split('\n').slice(0, 5).join('\n'),
                code: (error as any).code
            };
        }

        // Production: JSON logs for aggregation tools
        if (process.env.NODE_ENV === 'production') {
            console.log(JSON.stringify(logEntry));
        } else {
            // Development: Colored console logs
            this.logDevelopment(level, message, context, error, memory);
        }

        // Track errors for metrics
        if (level >= LogLevel.ERROR && error) {
            const errorType = error.name || 'UnknownError';
            this.errorCount.set(errorType, (this.errorCount.get(errorType) || 0) + 1);
        }
    }

    private logDevelopment(
        level: LogLevel,
        message: string,
        context?: LogContext,
        error?: Error,
        memory?: { used: number; total: number; percentage: number }
    ) {
        const colorMap = {
            [LogLevel.DEBUG]: chalk.gray,
            [LogLevel.INFO]: chalk.blue,
            [LogLevel.WARN]: chalk.yellow,
            [LogLevel.ERROR]: chalk.red,
            [LogLevel.FATAL]: chalk.bgRed.white
        };

        const color = colorMap[level] || chalk.white;
        const time = chalk.gray(`[${new Date().toISOString().split('T')[1].split('.')[0]}]`);
        const levelStr = color(LogLevel[level].padEnd(5));
        const memStr = memory ? chalk.gray(`[${memory.used}MB]`) : '';

        console.log(`${time} ${levelStr} ${memStr} ${message}`);

        if (context && Object.keys(context).length > 0) {
            const filtered = { ...context };
            delete filtered.error;
            delete filtered.metrics;
            if (Object.keys(filtered).length > 0) {
                console.log(chalk.gray('  📊 Context:'), filtered);
            }
        }

        if (context?.metrics) {
            console.log(chalk.cyan('  📈 Metrics:'), context.metrics);
        }

        if (error) {
            console.log(chalk.red('  ❌ Error:'), error.message);
            if (error.stack) {
                const stack = error.stack.split('\n').slice(1, 4).join('\n');
                console.log(chalk.gray(stack));
            }
        }
    }

    // Core logging methods
    public debug(message: string, context?: LogContext) {
        this.log(LogLevel.DEBUG, message, context);
    }

    public info(message: string, context?: LogContext) {
        this.log(LogLevel.INFO, message, context);
    }

    public warn(message: string, context?: LogContext) {
        this.log(LogLevel.WARN, message, context);
    }

    public error(message: string, error?: Error, context?: LogContext) {
        this.log(LogLevel.ERROR, message, context, error);
        this.failureCount++;
    }

    public fatal(message: string, error?: Error, context?: LogContext) {
        this.log(LogLevel.FATAL, message, context, error);
        this.failureCount++;
    }

    // Request tracking
    public trackRequest(endpoint: string, duration: number, success: boolean, statusCode?: number) {
        this.requestCount++;

        if (success) {
            this.successCount++;
        } else {
            this.failureCount++;
        }

        if (duration > 2000) {
            this.slowRequestCount++;
        }

        // Track endpoint-specific metrics
        const key = `${endpoint}-${statusCode || 'unknown'}`;
        const times = this.metrics.get(key) || [];
        times.push(duration);
        
        // Keep only last 100 requests
        if (times.length > 100) {
            times.shift();
        }
        this.metrics.set(key, times);
    }

    // Get comprehensive metrics
    public getMetrics(): PerformanceMetrics {
        const memory = this.getMemoryUsage();
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);

        return {
            totalRequests: this.requestCount,
            successfulRequests: this.successCount,
            failedRequests: this.failureCount,
            averageResponseTime: this.calculateAverageResponseTime(),
            slowRequests: this.slowRequestCount,
            errorRate: this.requestCount > 0 ? (this.failureCount / this.requestCount) * 100 : 0,
            memoryUsageMB: memory.used,
            uptime
        };
    }

    private calculateAverageResponseTime(): number {
        let totalTime = 0;
        let count = 0;

        this.metrics.forEach(times => {
            times.forEach(time => {
                totalTime += time;
                count++;
            });
        });

        return count > 0 ? Math.round(totalTime / count) : 0;
    }

    // Log metrics summary
    private logMetricsSummary() {
        const metrics = this.getMetrics();
        
        this.info('📊 METRICS SUMMARY', {
            metrics: {
                requests: {
                    total: metrics.totalRequests,
                    successful: metrics.successfulRequests,
                    failed: metrics.failedRequests,
                    slow: metrics.slowRequests
                },
                performance: {
                    avgResponseTime: `${metrics.averageResponseTime}ms`,
                    errorRate: `${metrics.errorRate.toFixed(2)}%`
                },
                system: {
                    memory: `${metrics.memoryUsageMB}MB`,
                    uptime: `${Math.floor(metrics.uptime / 60)}min`
                }
            }
        });

        // Log top errors
        if (this.errorCount.size > 0) {
            const topErrors = Array.from(this.errorCount.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([type, count]) => `${type}: ${count}`)
                .join(', ');
            
            this.warn(`🚨 Top Errors: ${topErrors}`);
        }
    }

    // Specialized logging
    public httpRequest(method: string, path: string, context?: LogContext) {
        this.info(`→ ${method} ${path}`, { ...context, source: 'HTTP' });
    }

    public httpResponse(statusCode: number, duration: number, context?: LogContext) {
        const emoji = statusCode < 400 ? '✅' : statusCode < 500 ? '⚠️' : '❌';
        this.info(`${emoji} ${statusCode} (${duration}ms)`, { ...context, statusCode, duration, source: 'HTTP' });
    }

    public sourceCall(source: string, operation: string, context?: LogContext) {
        this.debug(`🔌 ${source}.${operation}()`, { ...context, source });
    }

    public cacheEvent(event: 'hit' | 'miss' | 'set', key: string, context?: LogContext) {
        const emoji = event === 'hit' ? '✨' : event === 'miss' ? '🔍' : '💾';
        this.debug(`${emoji} Cache ${event}: ${key}`, { ...context, source: 'CACHE' });
    }

    public circuitBreaker(source: string, state: 'open' | 'closed' | 'half-open', context?: LogContext) {
        const emoji = state === 'open' ? '🔴' : state === 'half-open' ? '🟡' : '🟢';
        this.warn(`${emoji} Circuit breaker ${state}: ${source}`, { ...context, source: 'CIRCUIT' });
    }

    public timeout(operation: string, timeoutMs: number, context?: LogContext) {
        this.error(`⏱️ Timeout: ${operation} exceeded ${timeoutMs}ms`, undefined, { ...context, source: 'TIMEOUT' });
    }

    public healthCheck(service: string, healthy: boolean, latency?: number, context?: LogContext) {
        const emoji = healthy ? '💚' : '💔';
        const latencyStr = latency ? ` (${latency}ms)` : '';
        this.info(`${emoji} ${service}${latencyStr}`, { ...context, source: 'HEALTH' });
    }
}

export const enhancedLogger = EnhancedLogger.getInstance();

// Performance timer with automatic logging
export class PerformanceTimer {
    private start: number;
    private operation: string;
    private context?: LogContext;

    constructor(operation: string, context?: LogContext) {
        this.operation = operation;
        this.context = context;
        this.start = Date.now();
    }

    public end(success = true, additionalContext?: LogContext): number {
        const duration = Date.now() - this.start;
        const finalContext = { ...this.context, ...additionalContext, duration };

        if (duration > 5000) {
            enhancedLogger.warn(`🐌 Slow operation: ${this.operation} (${duration}ms)`, finalContext);
        } else if (duration > 2000) {
            enhancedLogger.info(`⏱️ ${this.operation} (${duration}ms)`, finalContext);
        } else {
            enhancedLogger.debug(`⚡ ${this.operation} (${duration}ms)`, finalContext);
        }

        enhancedLogger.trackRequest(this.operation, duration, success);
        return duration;
    }
}

// Request context helper
export function createRequestContext(req: {
    id?: string;
    headers?: Record<string, string | string[] | undefined>;
    ip?: string;
    connection?: { remoteAddress?: string };
    method?: string;
    path?: string;
    query?: Record<string, unknown>;
    params?: Record<string, unknown>;
}): LogContext {
    const getHeader = (key: string): string | undefined => {
        const val = req.headers?.[key];
        if (!val) return undefined;
        if (Array.isArray(val)) return val[0];
        return val;
    };

    return {
        requestId: req.id || getHeader('x-request-id'),
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: getHeader('user-agent'),
        method: req.method,
        path: req.path,
        query: req.query,
        params: req.params
    };
}
