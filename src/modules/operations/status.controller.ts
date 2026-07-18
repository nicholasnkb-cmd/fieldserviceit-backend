import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { OperationsService } from './operations.service';

@Controller('status')
export class StatusController {
  constructor(private readonly operationsService: OperationsService) {}

  @Public()
  @Get('notices')
  notices() {
    return this.operationsService.publicStatusNotices();
  }
}
