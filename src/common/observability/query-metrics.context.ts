import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestQueryMetrics {
  count: number;
  durationMs: number;
  slowestMs: number;
}

@Injectable()
export class QueryMetricsContext {
  private readonly storage = new AsyncLocalStorage<RequestQueryMetrics>();

  run<T>(callback: () => T): T {
    return this.storage.run({ count: 0, durationMs: 0, slowestMs: 0 }, callback);
  }

  record(durationMs: number) {
    const metrics = this.storage.getStore();
    if (!metrics) return;
    metrics.count += 1;
    metrics.durationMs += durationMs;
    metrics.slowestMs = Math.max(metrics.slowestMs, durationMs);
  }

  current(): RequestQueryMetrics | undefined {
    return this.storage.getStore();
  }
}
