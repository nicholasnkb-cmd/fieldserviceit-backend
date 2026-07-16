import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { Interval } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class DatabaseThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly db: DatabaseService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<{ totalHits: number; timeToExpire: number; isBlocked: boolean; timeToBlockExpire: number }> {
    const keyHash = crypto.createHash('sha256').update(`${throttlerName}:${key}`).digest('hex');
    const effectiveBlockMs = Math.max(1, blockDuration || ttl);
    await this.db.execute(
      `INSERT INTO RateLimitState (keyHash, totalHits, expiresAt, blockedUntil, updatedAt)
       VALUES (?, 1, DATE_ADD(NOW(3), INTERVAL ? MICROSECOND), NULL, NOW(3))
       ON DUPLICATE KEY UPDATE
         totalHits = IF(expiresAt <= NOW(3), 1, totalHits + 1),
         blockedUntil = IF(expiresAt <= NOW(3), NULL,
           IF(totalHits > ?, IF(blockedUntil > NOW(3), blockedUntil,
             DATE_ADD(NOW(3), INTERVAL ? MICROSECOND)), blockedUntil)),
         expiresAt = IF(expiresAt <= NOW(3), DATE_ADD(NOW(3), INTERVAL ? MICROSECOND), expiresAt),
         updatedAt = NOW(3)`,
      [keyHash, ttl * 1000, limit, effectiveBlockMs * 1000, ttl * 1000],
    );
    const rows = await this.db.query<any[]>(
      `SELECT totalHits,
              GREATEST(0, CEIL(TIMESTAMPDIFF(MICROSECOND, NOW(3), expiresAt) / 1000000)) AS timeToExpire,
              blockedUntil,
              GREATEST(0, CEIL(TIMESTAMPDIFF(MICROSECOND, NOW(3), blockedUntil) / 1000000)) AS timeToBlockExpire
       FROM RateLimitState WHERE keyHash = ? LIMIT 1`,
      [keyHash],
    );
    const row = rows[0];
    return {
      totalHits: Number(row?.totalHits || 1),
      timeToExpire: Number(row?.timeToExpire || 0),
      isBlocked: Boolean(row?.blockedUntil && new Date(row.blockedUntil).getTime() > Date.now()),
      timeToBlockExpire: Number(row?.timeToBlockExpire || 0),
    };
  }

  @Interval(60 * 60 * 1000)
  async cleanupExpiredState(): Promise<void> {
    await this.db.execute(
      `DELETE FROM RateLimitState
       WHERE expiresAt < DATE_SUB(NOW(3), INTERVAL 1 DAY)
         AND (blockedUntil IS NULL OR blockedUntil < NOW(3))`,
    );
  }
}
