import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ErrorReportsService } from './error-reports.service';

@Controller('error-reports')
export class ErrorReportsController {
  constructor(private errorReports: ErrorReportsService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(@Body() body: Record<string, any>, @Headers('user-agent') userAgent?: string) {
    return this.errorReports.create(body, userAgent || null);
  }
}
