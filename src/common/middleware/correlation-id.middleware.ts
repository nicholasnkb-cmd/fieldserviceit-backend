import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Correlation ID Middleware
 * 
 * Attaches a unique correlation ID to every request for distributed tracing.
 * 
 * Features:
 * - Generates a new UUID v4 if one is not provided in headers
 * - Accepts incoming X-Correlation-ID header from upstream services
 * - Stores correlation ID on request object for access in handlers
 * - Adds correlation ID to response headers
 * 
 * Usage:
 * - Track the same request across multiple services in logs
 * - Debugging distributed system issues
 * - Performance monitoring and analysis
 * 
 * Header: X-Correlation-ID
 * Example: X-Correlation-ID: 550e8400-e29b-41d4-a716-446655440000
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Check for existing correlation ID from upstream service
    const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'] || uuidv4();

    // Attach to request object for handlers to access
    (req as any).correlationId = String(correlationId);

    // Set response header so client can track responses
    res.setHeader('X-Correlation-ID', String(correlationId));

    // You can also attach to res.locals for Express middleware chain
    res.locals.correlationId = String(correlationId);

    next();
  }
}
