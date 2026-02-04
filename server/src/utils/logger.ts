import chalk from 'chalk';

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
    // In development, log almost everything
    if (process.env.NODE_ENV !== 'production') {
      if (level >= LogLevel.INFO) return true;
      if (source === 'API' || source === 'STREAM' || source === 'SourceManager') return true;
      return level >= this.logLevel;
    }

    // Production logic
    if (level >= LogLevel.ERROR) return true;
    if (source === 'API' || source === 'STREAM') return true;
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
      const colorMap = {
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
