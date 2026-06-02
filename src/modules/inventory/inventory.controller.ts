import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { BusinessOnly } from '../../common/decorators/business-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { CurrentUser as CurrentUserType } from '../../common/types';
import { BusinessOnlyGuard } from '../../common/guards/business-only.guard';
import { FeatureAccessGuard } from '../../common/guards/feature-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard)
@BusinessOnly()
@RequireFeature('assets')
export class InventoryController {
  constructor(private service: InventoryService) {}

  @Get('summary')
  summary(@CurrentUser() user: CurrentUserType) {
    return this.service.summary(user);
  }

  @Get('parts')
  listParts(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.service.listParts(user, query);
  }

  @Post('parts')
  createPart(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.createPart(user, dto);
  }

  @Patch('parts/:id')
  updatePart(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: any) {
    return this.service.updatePart(user, id, dto);
  }

  @Get('locations')
  listLocations(@CurrentUser() user: CurrentUserType) {
    return this.service.listLocations(user);
  }

  @Post('locations')
  createLocation(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.createLocation(user, dto);
  }

  @Post('movements')
  createMovement(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.createMovement(user, dto);
  }

  @Get('transactions')
  listTransactions(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.service.listTransactions(user, query);
  }
}
