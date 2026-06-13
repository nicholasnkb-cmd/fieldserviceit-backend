import { Controller, Get } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { ReportingService } from '../services/reporting.service';

@Controller('public/operations')
export class PublicOperationsController {
  constructor(private readonly reportingService: ReportingService) {}

  @Public()
  @Get()
  getLiveOperations() {
    return this.reportingService.getPublicOperations();
  }
}
