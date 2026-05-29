import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import { Request, Response } from 'express';

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl, throttler } = requestProps;
    const http = context.switchToHttp();
    const req: Request = http.getRequest();
    const res: Response = http.getResponse();

    const result = await super.handleRequest(requestProps);

    if (res) {
      const ip = req.ip || 'unknown';
      const name = throttler.name || 'default';
      const key = this.generateKey(context, ip, name);
      const { totalHits } = await this.storageService.increment(key, ttl, limit, 0, name);

      res.header('X-RateLimit-Limit', limit.toString());
      res.header('X-RateLimit-Remaining', Math.max(0, limit - totalHits).toString());
      res.header('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + ttl / 1000).toString());
    }

    return result;
  }
}
