import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../common/guards/business-only.guard';
import { FeatureAccessGuard } from '../../common/guards/feature-access.guard';
import { BusinessOnly } from '../../common/decorators/business-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../common/types';
import { OperationsService } from './operations.service';
import { CreateOperationItemDto, OperationModuleKey } from './dto/create-operation-item.dto';
import { UpdateOperationItemDto } from './dto/update-operation-item.dto';
import { AuthorizationExempt } from '../../common/decorators/authorization-exempt.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@Controller('operations')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard, PermissionsGuard)
@BusinessOnly()
export class OperationsController {
  constructor(private operationsService: OperationsService) {}

  @RequirePermissions('operations.view')
  @Get('modules')
  modules() {
    return this.operationsService.modules();
  }

  @RequirePermissions('operations.view')
  @Get('summary')
  summary(@CurrentUser() user: CurrentUserType) {
    return this.operationsService.summary(user);
  }

  @RequirePermissions('operations.view')
  @Get(':moduleKey/items')
  list(
    @Param('moduleKey') moduleKey: OperationModuleKey,
    @CurrentUser() user: CurrentUserType,
    @Query() query: { status?: string; search?: string; limit?: string },
  ) {
    return this.operationsService.list(moduleKey, user, query);
  }

  @RequirePermissions('operations.manage')
  @Post('items')
  create(@Body() dto: CreateOperationItemDto, @CurrentUser() user: CurrentUserType) {
    return this.operationsService.create(dto, user);
  }

  @RequirePermissions('operations.manage')
  @Patch('items/:id')
  update(@Param('id') id: string, @Body() dto: UpdateOperationItemDto, @CurrentUser() user: CurrentUserType) {
    return this.operationsService.update(id, dto, user);
  }
}
