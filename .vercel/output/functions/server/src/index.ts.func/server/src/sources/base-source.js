import axios from 'axios';
import { logger } from '../utils/logger.js';
/**
 * Abstract base class with common functionality
 */
export class BaseAnimeSource {
    isAvailable = true;
    // Failure tracking - only disable after consecutive failures, not a single error
    _consecutiveFailures = 0;
    _maxConsecutiveFailures = 5;
    _lastFailureTime = 0;
    _autoRecoverMs = 30000; // Auto re-enable after 30s
    _recoveryTimer = null;
    handleError(error, operation) {
        const err = error instanceof Error ? error : new Error(String(error));
        // Don't count cancellations/timeouts as failures
        if (err.name === 'AbortError' || err.message.includes('aborted') || err.message.includes('timed out') || axios.isCancel(error)) {
            logger.debug(`Operation ${operation} was aborted/timed out`, undefined, this.name);
            return;
        }
        // If already offline, don't pile on failures — recovery timer is already running
        if (!this.isAvailable)
            return;
        logger.error(`Error during ${operation}`, err, { operation }, this.name);
        this._consecutiveFailures++;
        this._lastFailureTime = Date.now();
        // Only mark unavailable after multiple consecutive failures
        if (this._consecutiveFailures >= this._maxConsecutiveFailures) {
            logger.warn(`Source ${this.name} marked offline after ${this._consecutiveFailures} consecutive failures`, undefined, this.name);
            this.isAvailable = false;
            this._consecutiveFailures = 0; // Reset so recovery gets a fresh start
            // Schedule auto-recovery (prevent stacking timers)
            if (this._recoveryTimer)
                clearTimeout(this._recoveryTimer);
            this._recoveryTimer = setTimeout(() => {
                this._recoveryTimer = null;
                this.isAvailable = true;
                this._consecutiveFailures = 0;
                logger.info(`Source ${this.name} auto-recovered after ${this._autoRecoverMs}ms cooldown`, undefined, this.name);
            }, this._autoRecoverMs);
        }
    }
    /**
     * Call on successful operations to reset the failure counter
     */
    handleSuccess() {
        if (this._consecutiveFailures > 0) {
            this._consecutiveFailures = 0;
        }
    }
}
//# sourceMappingURL=base-source.js.map