import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService extends ConsoleLogger {
  log(message: any, context?: string) {
    super.log(`[${new Date().toISOString()}] ${message}`, context);
  }

  warn(message: any, context?: string) {
    super.warn(`[${new Date().toISOString()}] ${message}`, context);
  }

  error(message: any, stack?: string, context?: string) {
    super.error(`[${new Date().toISOString()}] ${message}`, stack, context);
  }
}
