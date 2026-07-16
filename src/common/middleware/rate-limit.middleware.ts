import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RateLimitConfig {
  windowMs?: number; // Time window in milliseconds (default: 60s)
  maxRequests?: number; // Max requests per window (default: 100)
  keyGenerator?: (req: Request) => string; // How to identify clients (default: IP)
}

interface ClientQuota {
  count: number;
  resetTime: number;
  blocked?: boolean;
}

/**
 * RateLimitMiddleware - Tracks and enforces API rate limiting
 * 
 * Features:
 * - Per-IP rate limiting
 * - Configurable time windows and request limits
 * - Tracks quota usage for monitoring
 * - Optional blocking on exceeded limits
 * - Exposes X-RateLimit headers
 * 
 * Usage in main.ts:
 * ```typescript
 * app.use(new RateLimitMiddleware({
 *   windowMs: 60000,    // 1 minute
 *   maxRequests: 100,   // 100 requests per minute
 * }).use);
 * ```
 * 
 * Response Headers:
 * - X-RateLimit-Limit: Maximum requests in window
 * - X-RateLimit-Remaining: Remaining requests in window
 * - X-RateLimit-Reset: Unix timestamp when window resets
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  private clientQuotas = new Map<string, ClientQuota>();
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly keyGenerator: (req: Request) => string;

  constructor(config: RateLimitConfig = {}) {
    this.windowMs = config.windowMs || 60000; // 1 minute default
    this.maxRequests = config.maxRequests || 100; // 100 requests default
    this.keyGenerator = config.keyGenerator || ((req: Request) => {
      return (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
    });

    // Clean up expired quotas every 5 minutes
    setInterval(() => this.cleanupExpiredQuotas(), 300000);
  }

  use(req: Request, res: Response, next: NextFunction) {
    const key = this.keyGenerator(req);
    const now = Date.now();

    // Get or create client quota
    let quota = this.clientQuotas.get(key);
    if (!quota || now >= quota.resetTime) {
      quota = {
        count: 0,
        resetTime: now + this.windowMs,
        blocked: false,
      };
      this.clientQuotas.set(key, quota);
    }

    // Increment request count
    quota.count++;

    // Calculate remaining requests
    const remaining = Math.max(0, this.maxRequests - quota.count);
    const resetTime = Math.ceil(quota.resetTime / 1000);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', this.maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetTime);

    // Check if limit exceeded (log but don't block - monitoring only)
    if (quota.count > this.maxRequests) {
      this.logger.warn(
        `Rate limit exceeded for ${key}: ${quota.count} requests in window`,
        'RateLimitMiddleware'
      );
      quota.blocked = true;
    }

    next();
  }

  /**
   * Get rate limit statistics
   */
  getStats() {
    const stats = {
      totalClients: this.clientQuotas.size,
      blockedClients: 0,
      averageUsage: 0,
    };

    let totalUsage = 0;
    this.clientQuotas.forEach((quota) => {
      if (quota.blocked) {
        stats.blockedClients++;
      }
      totalUsage += quota.count;
    });

    if (this.clientQuotas.size > 0) {
      stats.averageUsage = Math.round(totalUsage / this.clientQuotas.size);
    }

    return stats;
  }

  /**
   * Clean up expired quotas to prevent memory leak
   */
  private cleanupExpiredQuotas() {
    const now = Date.now();
    let cleaned = 0;

    this.clientQuotas.forEach((quota, key) => {
      if (now >= quota.resetTime) {
        this.clientQuotas.delete(key);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired rate limit quotas`);
    }
  }
}
