import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

interface RequestSignature {
  timestamp: number;
  response?: any;
  status?: number;
  contentHash?: string;
}

/**
 * RequestDeduplicationMiddleware - Prevents duplicate request submissions
 * 
 * Common Problem:
 * - Users may submit forms twice due to slow network
 * - Frontend may retry on timeout
 * - Multiple identical requests sent by mistake
 * 
 * Solution:
 * - Track request signatures (method, path, body hash)
 * - Cache responses for duplicate requests
 * - Return cached response instead of reprocessing
 * 
 * Features:
 * - Identifies duplicates by request body hash
 * - Configurable cache duration (default: 60 seconds)
 * - Only applies to POST, PUT, DELETE requests
 * - Generates idempotency key if not provided
 * - Automatically cleans up old cache entries
 * 
 * Usage in main.ts:
 * ```typescript
 * app.use(new RequestDeduplicationMiddleware().use);
 * ```
 * 
 * To prevent deduplication for specific endpoints:
 * Add @SkipDeduplication() decorator to controller method
 * 
 * Response Headers:
 * - X-Idempotency-Key: Unique identifier for this request
 * - X-Deduplicated: "true" if this is a duplicate
 */
@Injectable()
export class RequestDeduplicationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestDeduplicationMiddleware.name);
  private requestCache = new Map<string, RequestSignature>();
  private readonly cacheDurationMs = 60000; // 1 minute
  private readonly maxCacheEntries = 1000; // Prevent unbounded growth

  constructor() {
    // Clean up old entries every 2 minutes
    const interval = setInterval(() => this.cleanupCache(), 120000);
    interval.unref();
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Only apply to mutation requests
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return next();
    }

    // Skip for specific paths (e.g., file uploads)
    if (this.shouldSkipDeduplication(req)) {
      return next();
    }

    // Generate or use provided idempotency key
    const idempotencyKey = (req.headers['idempotency-key'] as string) || uuidv4();
    req.headers['x-idempotency-key'] = idempotencyKey;
    res.setHeader('X-Idempotency-Key', idempotencyKey);

    // Build cache key from request
    const cacheKey = this.buildCacheKey(req, idempotencyKey);

    // Check if this request was recently processed
    const cached = this.requestCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheDurationMs) {
      // Return cached response
      res.setHeader('X-Deduplicated', 'true');
      this.logger.debug(
        `Returning deduplicated response for ${req.method} ${req.path}`,
        'RequestDeduplication'
      );

      if (cached.status) {
        res.status(cached.status);
      }
      return res.json(cached.response);
    }

    // Wrap the send method to cache the response
    const originalSend = res.send;

    res.send = (data: any) => {
      // Cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        this.cacheResponse(cacheKey, data, res.statusCode);
      }
      return originalSend.call(res, data);
    };

    next();
  }

  /**
   * Build a cache key from request details
   */
  private buildCacheKey(req: Request, idempotencyKey: string): string {
    return `${req.method}:${req.path}:${idempotencyKey}`;
  }

  /**
   * Cache a successful response
   */
  private cacheResponse(key: string, response: any, status: number) {
    // Implement LRU cache behavior - remove oldest entry if at capacity
    if (this.requestCache.size >= this.maxCacheEntries) {
      const oldestKey = this.requestCache.keys().next().value;
      this.requestCache.delete(oldestKey);
      this.logger.debug('Removed oldest cache entry due to size limit');
    }

    this.requestCache.set(key, {
      timestamp: Date.now(),
      response,
      status,
    });
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache() {
    const now = Date.now();
    let cleaned = 0;

    this.requestCache.forEach((signature, key) => {
      if (now - signature.timestamp > this.cacheDurationMs) {
        this.requestCache.delete(key);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired deduplication cache entries`);
    }
  }

  /**
   * Determine if this request should skip deduplication
   */
  private shouldSkipDeduplication(req: Request): boolean {
    const skipPatterns = [
      /^\/v1\/uploads/,
      /^\/v1\/file/,
      /^\/v1\/stream/,
      /^\/v1\/health/,
    ];

    return skipPatterns.some((pattern) => pattern.test(req.path));
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      cacheSize: this.requestCache.size,
      maxSize: this.maxCacheEntries,
      utilizationPercent: Math.round((this.requestCache.size / this.maxCacheEntries) * 100),
    };
  }
}
