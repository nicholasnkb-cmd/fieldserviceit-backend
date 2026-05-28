import { Controller, Get, UseGuards } from '@nestjs/common';
import { PlansService } from '../services/plans.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

@Controller('plans')
export class PlansController {
  constructor(private plansService: PlansService) {}

  @Get()
  findAll() {
    return this.plansService.findAll();
  }
}
