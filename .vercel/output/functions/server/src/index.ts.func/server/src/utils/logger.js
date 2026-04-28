import chalk from 'chalk';
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["TRACE"] = 0] = "TRACE";
    LogLevel[LogLevel["DEBUG"] = 1] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["WARN"] = 3] = "WARN";
    LogLevel[LogLevel["ERROR"] = 4] = "ERROR";
    LogLevel[LogLevel["FATAL"] = 5] = "FATAL";
})(LogLevel || (LogLevel = {}));
// Professional emoji indicators for different log types
const LOG_ICONS = {
    source: '📡',
    stream: '🎬',
    search: '🔍',
    cache: '💾',
    health: '💓',
    failover: '🔄',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    performance: '⚡',
    aggregation: '🔗',
    request: '📥',
    response: '📤',
    startup: '🚀',
    shutdown: '🛑',
    circuit: '🔌',
    retry: '🔁',
    timeout: '⏱️',
    rateLimit: '🚦',
    episode: '📺',
    anime: '🎌'
};
class Logger {
    static instance;
    logLevel = LogLevel.INFO;
    enabledSources = [];
    constructor() {
        // Set log level from environment
        const envLevel = process.env.LOG_LEVEL?.toUpperCase();
        if (envLevel && envLevel in LogLevel) {
            this.logLevel = LogLevel[envLevel];
        }
        // Parse enabled sources
        if (process.env.LOG_SOURCES) {
            this.enabledSources = process.env.LOG_SOURCES.split(',').map(s => s.trim());
        }
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    shouldLog(level, source) {
        // In development, log everything for intense debugging
        if (process.env.NODE_ENV !== 'production') {
            // Always log INFO and above
            if (level >= LogLevel.INFO)
                return true;
            // Log DEBUG for important sources
            if (level >= LogLevel.DEBUG && (source === 'API' ||
                source === 'STREAM' ||
                source === 'SourceManager' ||
                source === 'AGGREGATOR' ||
                source === 'HEALTH' ||
                source === 'FAILOVER'))
                return true;
            // Log TRACE only if explicitly enabled
            if (level === LogLevel.TRACE && process.env.LOG_TRACE === 'true')
                return true;
            return level >= this.logLevel;
        }
        // Production logic - still log important events
        if (level >= LogLevel.WARN)
            return true;
        if (source === 'API' || source === 'STREAM' || source === 'SourceManager')
            return true;
        return false;
    }
    log(level, message, context, source, error) {
        if (!this.shouldLog(level, source))
            return;
        const timestamp = new Date().toISOString();
        const levelName = LogLevel[level];
        const sourceName = source || 'SYSTEM';
        // 1. Log JSON for log aggregation tools (standard out)
        const logEntry = {
            timestamp,
            level: levelName,
            source: sourceName,
            message: message.replace(/\u001b\[\d+m/g, ''),
            ...context,
            error: error ? {
                message: error.message,
                name: error.name,
                stack: error.stack,
                code: error.code,
                cause: error.cause
            } : undefined
        };
        // Only log JSON in production or if requested
        if (process.env.NODE_ENV === 'production') {
            console.log(JSON.stringify(logEntry));
        }
        else {
            // 2. Dev-friendly colored logging
            const colorMap = {
                [LogLevel.TRACE]: chalk.dim,
                [LogLevel.DEBUG]: chalk.gray,
                [LogLevel.INFO]: chalk.blue,
                [LogLevel.WARN]: chalk.yellow,
                [LogLevel.ERROR]: chalk.red,
                [LogLevel.FATAL]: chalk.bgRed.white
            };
            const color = colorMap[level] || chalk.white;
            const timeStr = chalk.gray(`[${timestamp.split('T')[1].split('.')[0]}]`);
            const sourceStr = chalk.bold(sourceName.padEnd(12));
            const levelStr = color(levelName.padEnd(5));
            console.log(`${timeStr} ${levelStr} ${chalk.cyan(sourceStr)} ${message}`);
            if (context && Object.keys(context).length > 0) {
                console.log(chalk.gray('  Context:'), JSON.stringify(context, null, 2).split('\n').join('\n  '));
            }
            if (error) {
                console.log(chalk.red('  Error:'), error.message);
                if (error.stack) {
                    console.log(chalk.gray(error.stack.split('\n').slice(1, 4).join('\n')));
                }
            }
        }
    }
    debug(message, context, source) {
        this.log(LogLevel.DEBUG, message, context, source);
    }
    info(message, context, source) {
        this.log(LogLevel.INFO, message, context, source);
    }
    warn(message, context, source) {
        this.log(LogLevel.WARN, message, context, source);
    }
    error(message, error, context, source) {
        this.log(LogLevel.ERROR, message, context, source, error);
    }
    fatal(message, error, context, source) {
        this.log(LogLevel.FATAL, message, context, source, error);
    }
    // Specialized logging methods
    apiRequest(method, path, context) {
        this.info(`${method} ${path}`, context, 'API');
    }
    apiResponse(statusCode, context) {
        this.info(`Response ${statusCode}`, context, 'API');
    }
    sourceRequest(sourceName, operation, context) {
        this.info(`${sourceName} ${operation}`, context, sourceName);
    }
    sourceResponse(sourceName, operation, success, context) {
        this.info(`${sourceName} ${operation} ${success ? 'SUCCESS' : 'FAILED'}`, context, sourceName);
    }
    cacheHit(key, context) {
        this.debug(`Cache hit: ${key}`, context, 'CACHE');
    }
    cacheMiss(key, context) {
        this.debug(`Cache miss: ${key}`, context, 'CACHE');
    }
    streamRequest(episodeId, server, context) {
        this.info(`Stream request: ${episodeId} from ${server}`, context, 'STREAM');
    }
    healthCheck(sourceName, healthy, latency, context) {
        this.info(`${sourceName} ${healthy ? 'HEALTHY' : 'UNHEALTHY'} ${latency ? `(${latency}ms)` : ''}`, context, 'HEALTH');
    }
    failover(fromSource, toSource, reason, context) {
        this.warn(`Failover: ${fromSource} -> ${toSource} (${reason})`, context, 'FAILOVER');
    }
    performance(operation, duration, context) {
        this.info(`Performance: ${operation} ${duration}ms`, context, 'PERF');
    }
    // Enhanced logging methods
    circuitBreakerTripped(sourceName, failureCount, resetTime, context) {
        this.error(`Circuit breaker tripped for ${sourceName} (${failureCount} failures, reset in ${resetTime}ms)`, undefined, context, 'CIRCUIT');
    }
    circuitBreakerReset(sourceName, context) {
        this.info(`Circuit breaker reset for ${sourceName}`, context, 'CIRCUIT');
    }
    retryAttempt(operation, attempt, maxAttempts, delay, context) {
        this.warn(`Retry ${attempt}/${maxAttempts} for ${operation} (delay: ${delay}ms)`, context, 'RETRY');
    }
    requestTimeout(operation, timeout, context) {
        this.error(`Request timeout: ${operation} (${timeout}ms)`, undefined, context, 'TIMEOUT');
    }
    connectionError(operation, error, context) {
        this.error(`Connection error: ${operation} - ${error.message}`, error, context, 'CONNECTION');
    }
    parsingError(operation, error, context) {
        this.error(`Parsing error: ${operation} - ${error.message}`, error, context, 'PARSING');
    }
    rateLimitExceeded(sourceName, retryAfter, context) {
        this.warn(`Rate limit exceeded for ${sourceName}, retry after ${retryAfter}ms`, context, 'RATE_LIMIT');
    }
    resourceExhausted(operation, limit, current, context) {
        this.error(`Resource exhausted: ${operation} (limit: ${limit}, current: ${current})`, undefined, context, 'RESOURCE');
    }
    slowOperation(operation, duration, threshold, context) {
        this.warn(`Slow operation: ${operation} took ${duration}ms (threshold: ${threshold}ms)`, context, 'PERF');
    }
    dependencyFailure(dependency, operation, error, context) {
        this.error(`Dependency failure: ${dependency} - ${operation} failed`, error, context, 'DEPENDENCY');
    }
    // ============ ENHANCED PROFESSIONAL LOGGING ============
    sourceAggregation(operation, sources, context) {
        const sourceList = sources.join(', ');
        this.info(`${LOG_ICONS.aggregation} Aggregating from ${sources.length} sources: [${sourceList}]`, context, 'AGGREGATOR');
    }
    sourceResult(sourceName, operation, resultCount, duration, context) {
        const icon = resultCount > 0 ? LOG_ICONS.success : LOG_ICONS.warning;
        this.info(`${icon} ${sourceName} ${operation}: ${resultCount} results (${duration}ms)`, { ...context, resultCount, duration }, sourceName);
    }
    streamingStart(animeId, episodeId, source, context) {
        this.info(`${LOG_ICONS.stream} Starting stream: ${animeId} - Episode ${episodeId} from ${source}`, context, 'STREAM');
    }
    streamingSuccess(animeId, episodeId, source, quality, duration, context) {
        this.info(`${LOG_ICONS.success} Stream ready: ${animeId} - Episode ${episodeId} [${quality}] from ${source} (${duration}ms)`, { ...context, quality, duration }, 'STREAM');
    }
    streamingFailed(animeId, episodeId, source, error, context) {
        this.warn(`${LOG_ICONS.error} Stream failed: ${animeId} - Episode ${episodeId} from ${source}: ${error}`, context, 'STREAM');
    }
    episodeFetch(animeId, episodeCount, source, duration, context) {
        this.info(`${LOG_ICONS.episode} Fetched ${episodeCount} episodes for ${animeId} from ${source} (${duration}ms)`, { ...context, episodeCount, duration }, 'EPISODES');
    }
    animeInfo(animeId, title, source, duration, context) {
        this.info(`${LOG_ICONS.anime} Loaded: "${title}" [${animeId}] from ${source} (${duration}ms)`, { ...context, title, duration }, 'ANIME');
    }
    multiSourceSearch(query, sources, totalResults, duration, context) {
        this.info(`${LOG_ICONS.search} Multi-source search "${query}": ${totalResults} results from ${sources.length} sources (${duration}ms)`, { ...context, sources, totalResults, duration }, 'SEARCH');
    }
    sourceOnline(sourceName, latency, context) {
        const latencyStr = latency ? ` (${latency}ms)` : '';
        this.info(`${LOG_ICONS.success} ${sourceName} is ONLINE${latencyStr}`, context, 'HEALTH');
    }
    sourceOffline(sourceName, reason, context) {
        const reasonStr = reason ? `: ${reason}` : '';
        this.warn(`${LOG_ICONS.error} ${sourceName} is OFFLINE${reasonStr}`, context, 'HEALTH');
    }
    healthSummary(online, total, onlineSources, offlineSources, duration, context) {
        console.log('');
        console.log(chalk.cyan('╔══════════════════════════════════════════════════════════════════╗'));
        console.log(chalk.cyan('║') + chalk.bold.white('                    📊 SOURCE HEALTH SUMMARY                      ') + chalk.cyan('║'));
        console.log(chalk.cyan('╠══════════════════════════════════════════════════════════════════╣'));
        console.log(chalk.cyan('║') + ` ${LOG_ICONS.success} Online: ${chalk.green.bold(online)}/${total} sources (${duration}ms)`.padEnd(67) + chalk.cyan('║'));
        console.log(chalk.cyan('║') + ` ${chalk.green('Available:')} ${onlineSources.slice(0, 8).join(', ')}`.padEnd(67) + chalk.cyan('║'));
        if (onlineSources.length > 8) {
            console.log(chalk.cyan('║') + `            + ${onlineSources.length - 8} more sources`.padEnd(67) + chalk.cyan('║'));
        }
        if (offlineSources.length > 0) {
            console.log(chalk.cyan('║') + ` ${chalk.red('Offline:')} ${offlineSources.slice(0, 6).join(', ')}`.padEnd(67) + chalk.cyan('║'));
            if (offlineSources.length > 6) {
                console.log(chalk.cyan('║') + `          + ${offlineSources.length - 6} more offline`.padEnd(67) + chalk.cyan('║'));
            }
        }
        console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════════╝'));
        console.log('');
        this.info(`Health check complete: ${online}/${total} sources online`, { online, total, duration }, 'HEALTH');
    }
    startupBanner(version, port, sources) {
        const onlineSources = sources.filter(s => s.status === 'online');
        const primarySources = onlineSources.slice(0, 4);
        console.log('');
        console.log(chalk.cyan('╔══════════════════════════════════════════════════════════════════╗'));
        console.log(chalk.cyan('║') + chalk.bold.white('                                                                  ') + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.bold.hex('#FF6600')('   🎬 AniStream Hub API Server ') + chalk.white(`v${version}`.padEnd(32)) + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.gray('   ─────────────────────────────────────                        ') + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.white(`   Server: `) + chalk.green(`http://localhost:${port}`.padEnd(52)) + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.white(`   API Docs: `) + chalk.blue(`http://localhost:${port}/api`.padEnd(50)) + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.white(`   Health: `) + chalk.blue(`http://localhost:${port}/api/health`.padEnd(52)) + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.white(`   Port: `) + chalk.yellow(`${port} (Local)`.padEnd(54)) + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.white('                                                                  ') + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.bold.white('   📡 Active Streaming Sources:                                   ') + chalk.cyan('║'));
        primarySources.forEach((source, i) => {
            const status = source.status === 'online' ? chalk.green('●') : chalk.red('○');
            const priority = i === 0 ? chalk.yellow('★ Primary') : chalk.gray(`Priority ${i + 1}`);
            console.log(chalk.cyan('║') + `   ${status} ${source.name.padEnd(20)} ${priority}`.padEnd(67) + chalk.cyan('║'));
        });
        if (onlineSources.length > 4) {
            console.log(chalk.cyan('║') + chalk.gray(`   + ${onlineSources.length - 4} more backup sources available`.padEnd(66)) + chalk.cyan('║'));
        }
        console.log(chalk.cyan('║') + chalk.white('                                                                  ') + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.bold.white('   ⚡ Features:                                                    ') + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.white('   • Multi-source aggregation for best results                    ') + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.white('   • Real-time streaming with auto-failover                       ') + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.white('   • Smart caching & rate limiting                                ') + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.white('   • HLS proxy for CORS bypass                                    ') + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.white('                                                                  ') + chalk.cyan('║'));
        console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════════╝'));
        console.log('');
    }
    requestStart(method, path, requestId, context) {
        this.info(`${LOG_ICONS.request} ${method} ${path}`, { ...context, requestId }, 'API');
    }
    requestEnd(method, path, statusCode, duration, requestId, context) {
        const icon = statusCode < 400 ? LOG_ICONS.response : LOG_ICONS.error;
        const statusColor = statusCode < 400 ? chalk.green : statusCode < 500 ? chalk.yellow : chalk.red;
        this.info(`${icon} ${method} ${path} ${statusColor(statusCode)} (${duration}ms)`, { ...context, statusCode, duration, requestId }, 'API');
    }
    aggregationComplete(operation, sources, successfulSources, totalResults, duration, context) {
        const successRate = Math.round((successfulSources.length / sources.length) * 100);
        this.info(`${LOG_ICONS.aggregation} ${operation} complete: ${totalResults} results from ${successfulSources.length}/${sources.length} sources (${successRate}% success, ${duration}ms)`, { ...context, sources, successfulSources, totalResults, duration, successRate }, 'AGGREGATOR');
    }
}
export const logger = Logger.getInstance();
// Request context helper
export function createRequestContext(req) {
    const getHeader = (key) => {
        const val = req.headers?.[key];
        if (!val)
            return undefined;
        if (Array.isArray(val))
            return val[0];
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
// Performance timer with enhanced metrics
export class PerformanceTimer {
    start;
    operation;
    context;
    source;
    threshold;
    constructor(operation, context, source, threshold) {
        this.operation = operation;
        this.context = context;
        this.source = source;
        this.start = Date.now();
        this.threshold = threshold || 2000; // Default slow operation threshold: 2 seconds
    }
    end(additionalContext) {
        const duration = Date.now() - this.start;
        const finalContext = { ...this.context, ...additionalContext, duration };
        // Log performance metric
        logger.performance(this.operation, duration, finalContext);
        // Warn about slow operations
        if (duration > this.threshold) {
            logger.slowOperation(this.operation, duration, this.threshold, finalContext);
        }
        return duration;
    }
}
//# sourceMappingURL=logger.js.map