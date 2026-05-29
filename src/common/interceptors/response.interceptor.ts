import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, any>;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const now = new Date().toISOString();
    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && 'success' in data && 'timestamp' in data) {
          return data;
        }
        if (data && typeof data === 'object' && 'data' in data && 'meta' in data) {
          return { success: true, data: data.data, meta: data.meta, timestamp: now };
        }
        return { success: true, data, timestamp: now };
      }),
    );
  }
}
