import chalk from 'chalk';

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5
}

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

export interface LogContext {
  source?: string;
  requestId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  duration?: number;
  attempt?: number;
  maxAttempts?: number;
  retryDelay?: number;
  cacheKey?: string;
  cacheHit?: boolean;
  sourceName?: string;
  operation?: string;
  statusCode?: number;
  errorType?: string;
  errorCode?: string;
  [key: string]: unknown;
}

class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private enabledSources: string[] = [];

  private constructor() {
    // Set log level from environment
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel && envLevel in LogLevel) {
      this.logLevel = LogLevel[envLevel as keyof typeof LogLevel];
    }

    // Parse enabled sources
    if (process.env.LOG_SOURCES) {
      this.enabledSources = process.env.LOG_SOURCES.split(',').map(s => s.trim());
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private shouldLog(level: LogLevel, source?: string): boolean {
    // In development, log everything for intense debugging
    if (process.env.NODE_ENV !== 'production') {
      // Always log INFO and above
      if (level >= LogLevel.INFO) return true;
      // Log DEBUG for important sources
      if (level >= LogLevel.DEBUG && (
        source === 'API' || 
        source === 'STREAM' || 
        source === 'SourceManager' ||
        source === 'AGGREGATOR' ||
        source === 'HEALTH' ||
        source === 'FAILOVER'
      )) return true;
      // Log TRACE only if explicitly enabled
      if (level === LogLevel.TRACE && process.env.LOG_TRACE === 'true') return true;
      return level >= this.logLevel;
    }

    // Production logic - still log important events
    if (level >= LogLevel.WARN) return true;
    if (source === 'API' || source === 'STREAM' || source === 'SourceManager') return true;
    return false;
  }

  private log(level: LogLevel, message: string, context?: LogContext, source?: string, error?: Error) {
    if (!this.shouldLog(level, source)) return;

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
        code: (error as any).code,
        cause: (error as any).cause
      } : undefined
    };

    // Only log JSON in production or if requested
    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify(logEntry));
    } else {
      // 2. Dev-friendly colored logging
      const colorMap: Record<LogLevel, typeof chalk.gray> = {
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

  public debug(message: string, context?: LogContext, source?: string) {
    this.log(LogLevel.DEBUG, message, context, source);
  }

  public info(message: string, context?: LogContext, source?: string) {
    this.log(LogLevel.INFO, message, context, source);
  }

  public warn(message: string, context?: LogContext, source?: string) {
    this.log(LogLevel.WARN, message, context, source);
  }

  public error(message: string, error?: Error, context?: LogContext, source?: string) {
    this.log(LogLevel.ERROR, message, context, source, error);
  }

  public fatal(message: string, error?: Error, context?: LogContext, source?: string) {
    this.log(LogLevel.FATAL, message, context, source, error);
  }

  // Specialized logging methods
  public apiRequest(method: string, path: string, context?: LogContext) {
    this.info(`${method} ${path}`, context, 'API');
  }

  public apiResponse(statusCode: number, context?: LogContext) {
    this.info(`Response ${statusCode}`, context, 'API');
  }

  public sourceRequest(sourceName: string, operation: string, context?: LogContext) {
    this.info(`${sourceName} ${operation}`, context, sourceName);
  }

  public sourceResponse(sourceName: string, operation: string, success: boolean, context?: LogContext) {
    this.info(`${sourceName} ${operation} ${success ? 'SUCCESS' : 'FAILED'}`, context, sourceName);
  }

  public cacheHit(key: string, context?: LogContext) {
    this.debug(`Cache hit: ${key}`, context, 'CACHE');
  }

  public cacheMiss(key: string, context?: LogContext) {
    this.debug(`Cache miss: ${key}`, context, 'CACHE');
  }

  public streamRequest(episodeId: string, server: string, context?: LogContext) {
    this.info(`Stream request: ${episodeId} from ${server}`, context, 'STREAM');
  }

  public healthCheck(sourceName: string, healthy: boolean, latency?: number, context?: LogContext) {
    this.info(`${sourceName} ${healthy ? 'HEALTHY' : 'UNHEALTHY'} ${latency ? `(${latency}ms)` : ''}`, context, 'HEALTH');
  }

  public failover(fromSource: string, toSource: string, reason: string, context?: LogContext) {
    this.warn(`Failover: ${fromSource} -> ${toSource} (${reason})`, context, 'FAILOVER');
  }

  public performance(operation: string, duration: number, context?: LogContext) {
    this.info(`Performance: ${operation} ${duration}ms`, context, 'PERF');
  }

  // Enhanced logging methods
  public circuitBreakerTripped(sourceName: string, failureCount: number, resetTime: number, context?: LogContext) {
    this.error(`Circuit breaker tripped for ${sourceName} (${failureCount} failures, reset in ${resetTime}ms)`, undefined, context, 'CIRCUIT');
  }

  public circuitBreakerReset(sourceName: string, context?: LogContext) {
    this.info(`Circuit breaker reset for ${sourceName}`, context, 'CIRCUIT');
  }

  public retryAttempt(operation: string, attempt: number, maxAttempts: number, delay: number, context?: LogContext) {
    this.warn(`Retry ${attempt}/${maxAttempts} for ${operation} (delay: ${delay}ms)`, context, 'RETRY');
  }

  public requestTimeout(operation: string, timeout: number, context?: LogContext) {
    this.error(`Request timeout: ${operation} (${timeout}ms)`, undefined, context, 'TIMEOUT');
  }

  public connectionError(operation: string, error: Error, context?: LogContext) {
    this.error(`Connection error: ${operation} - ${error.message}`, error, context, 'CONNECTION');
  }

  public parsingError(operation: string, error: Error, context?: LogContext) {
    this.error(`Parsing error: ${operation} - ${error.message}`, error, context, 'PARSING');
  }

  public rateLimitExceeded(sourceName: string, retryAfter: number, context?: LogContext) {
    this.warn(`Rate limit exceeded for ${sourceName}, retry after ${retryAfter}ms`, context, 'RATE_LIMIT');
  }

  public resourceExhausted(operation: string, limit: number, current: number, context?: LogContext) {
    this.error(`Resource exhausted: ${operation} (limit: ${limit}, current: ${current})`, undefined, context, 'RESOURCE');
  }

  public slowOperation(operation: string, duration: number, threshold: number, context?: LogContext) {
    this.warn(`Slow operation: ${operation} took ${duration}ms (threshold: ${threshold}ms)`, context, 'PERF');
  }

  public dependencyFailure(dependency: string, operation: string, error: Error, context?: LogContext) {
    this.error(`Dependency failure: ${dependency} - ${operation} failed`, error, context, 'DEPENDENCY');
  }

  // ============ ENHANCED PROFESSIONAL LOGGING ============

  public sourceAggregation(operation: string, sources: string[], context?: LogContext) {
    const sourceList = sources.join(', ');
    this.info(`${LOG_ICONS.aggregation} Aggregating from ${sources.length} sources: [${sourceList}]`, context, 'AGGREGATOR');
  }

  public sourceResult(sourceName: string, operation: string, resultCount: number, duration: number, context?: LogContext) {
    const icon = resultCount > 0 ? LOG_ICONS.success : LOG_ICONS.warning;
    this.info(`${icon} ${sourceName} ${operation}: ${resultCount} results (${duration}ms)`, { ...context, resultCount, duration }, sourceName);
  }

  public streamingStart(animeId: string, episodeId: string, source: string, context?: LogContext) {
    this.info(`${LOG_ICONS.stream} Starting stream: ${animeId} - Episode ${episodeId} from ${source}`, context, 'STREAM');
  }

  public streamingSuccess(animeId: string, episodeId: string, source: string, quality: string, duration: number, context?: LogContext) {
    this.info(`${LOG_ICONS.success} Stream ready: ${animeId} - Episode ${episodeId} [${quality}] from ${source} (${duration}ms)`, { ...context, quality, duration }, 'STREAM');
  }

  public streamingFailed(animeId: string, episodeId: string, source: string, error: string, context?: LogContext) {
    this.warn(`${LOG_ICONS.error} Stream failed: ${animeId} - Episode ${episodeId} from ${source}: ${error}`, context, 'STREAM');
  }

  public episodeFetch(animeId: string, episodeCount: number, source: string, duration: number, context?: LogContext) {
    this.info(`${LOG_ICONS.episode} Fetched ${episodeCount} episodes for ${animeId} from ${source} (${duration}ms)`, { ...context, episodeCount, duration }, 'EPISODES');
  }

  public animeInfo(animeId: string, title: string, source: string, duration: number, context?: LogContext) {
    this.info(`${LOG_ICONS.anime} Loaded: "${title}" [${animeId}] from ${source} (${duration}ms)`, { ...context, title, duration }, 'ANIME');
  }

  public multiSourceSearch(query: string, sources: string[], totalResults: number, duration: number, context?: LogContext) {
    this.info(`${LOG_ICONS.search} Multi-source search "${query}": ${totalResults} results from ${sources.length} sources (${duration}ms)`, { ...context, sources, totalResults, duration }, 'SEARCH');
  }

  public sourceOnline(sourceName: string, latency?: number, context?: LogContext) {
    const latencyStr = latency ? ` (${latency}ms)` : '';
    this.info(`${LOG_ICONS.success} ${sourceName} is ONLINE${latencyStr}`, context, 'HEALTH');
  }

  public sourceOffline(sourceName: string, reason?: string, context?: LogContext) {
    const reasonStr = reason ? `: ${reason}` : '';
    this.warn(`${LOG_ICONS.error} ${sourceName} is OFFLINE${reasonStr}`, context, 'HEALTH');
  }

  public healthSummary(online: number, total: number, onlineSources: string[], offlineSources: string[], duration: number, context?: LogContext) {
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

  public startupBanner(version: string, port: number, sources: { name: string; priority: number; status: string }[]) {
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

  public requestStart(method: string, path: string, requestId: string, context?: LogContext) {
    this.info(`${LOG_ICONS.request} ${method} ${path}`, { ...context, requestId }, 'API');
  }

  public requestEnd(method: string, path: string, statusCode: number, duration: number, requestId: string, context?: LogContext) {
    const icon = statusCode < 400 ? LOG_ICONS.response : LOG_ICONS.error;
    const statusColor = statusCode < 400 ? chalk.green : statusCode < 500 ? chalk.yellow : chalk.red;
    this.info(`${icon} ${method} ${path} ${statusColor(statusCode)} (${duration}ms)`, { ...context, statusCode, duration, requestId }, 'API');
  }

  public aggregationComplete(operation: string, sources: string[], successfulSources: string[], totalResults: number, duration: number, context?: LogContext) {
    const successRate = Math.round((successfulSources.length / sources.length) * 100);
    this.info(`${LOG_ICONS.aggregation} ${operation} complete: ${totalResults} results from ${successfulSources.length}/${sources.length} sources (${successRate}% success, ${duration}ms)`, 
      { ...context, sources, successfulSources, totalResults, duration, successRate }, 'AGGREGATOR');
  }
}

export const logger = Logger.getInstance();

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

// Performance timer with enhanced metrics
export class PerformanceTimer {
  private start: number;
  private operation: string;
  private context?: LogContext;
  private source?: string;
  private threshold: number;

  constructor(operation: string, context?: LogContext, source?: string, threshold?: number) {
    this.operation = operation;
    this.context = context;
    this.source = source;
    this.start = Date.now();
    this.threshold = threshold || 2000; // Default slow operation threshold: 2 seconds
  }

  public end(additionalContext?: LogContext) {
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
