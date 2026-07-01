import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, any>;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const rawContentType = this.reflector.getAllAndOverride<string>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (rawContentType) {
      context.switchToHttp().getResponse().setHeader('Content-Type', rawContentType);
      return next.handle() as Observable<any>;
    }
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
