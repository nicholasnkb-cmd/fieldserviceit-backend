import { Controller, Get, UseGuards } from '@nestjs/common';
import { PlansService } from '../services/plans.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { Public } from '../../../common/decorators/public.decorator';

@Controller('plans')
export class PlansController {
  constructor(private plansService: PlansService) {}

  @Get()
  @Public()
  findAll() {
    return this.plansService.findAll();
  }
}
