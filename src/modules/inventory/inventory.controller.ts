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
import { AuthorizationExempt } from '../../common/decorators/authorization-exempt.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard, PermissionsGuard)
@BusinessOnly()
@RequireFeature('assets')
export class InventoryController {
  constructor(private service: InventoryService) {}

  @RequirePermissions('inventory.view')
  @Get('summary')
  summary(@CurrentUser() user: CurrentUserType) {
    return this.service.summary(user);
  }

  @RequirePermissions('inventory.view')
  @Get('parts')
  listParts(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.service.listParts(user, query);
  }

  @RequirePermissions('inventory.manage')
  @Post('parts')
  createPart(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.createPart(user, dto);
  }

  @RequirePermissions('inventory.manage')
  @Patch('parts/:id')
  updatePart(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: any) {
    return this.service.updatePart(user, id, dto);
  }

  @RequirePermissions('inventory.view')
  @Get('locations')
  listLocations(@CurrentUser() user: CurrentUserType) {
    return this.service.listLocations(user);
  }

  @RequirePermissions('inventory.manage')
  @Post('locations')
  createLocation(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.createLocation(user, dto);
  }

  @RequirePermissions('inventory.manage')
  @Post('movements')
  createMovement(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.createMovement(user, dto);
  }

  @RequirePermissions('inventory.view')
  @Get('transactions')
  listTransactions(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.service.listTransactions(user, query);
  }
}
