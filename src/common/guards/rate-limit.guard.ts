import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import { Response } from 'express';

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl } = requestProps;
    const http = context.switchToHttp();
    const res: Response = http.getResponse();

    const result = await super.handleRequest(requestProps);

    if (res) {
      res.header('X-RateLimit-Limit', limit.toString());
      res.header('X-RateLimit-Remaining', 'unknown');
      res.header('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + ttl / 1000).toString());
    }

    return result;
  }
}
