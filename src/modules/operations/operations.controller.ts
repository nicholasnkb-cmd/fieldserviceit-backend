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

@Controller('operations')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard)
@BusinessOnly()
export class OperationsController {
  constructor(private operationsService: OperationsService) {}

  @Get('modules')
  modules() {
    return this.operationsService.modules();
  }

  @Get('summary')
  summary(@CurrentUser() user: CurrentUserType) {
    return this.operationsService.summary(user);
  }

  @Get(':moduleKey/items')
  list(
    @Param('moduleKey') moduleKey: OperationModuleKey,
    @CurrentUser() user: CurrentUserType,
    @Query() query: { status?: string; search?: string; limit?: string },
  ) {
    return this.operationsService.list(moduleKey, user, query);
  }

  @Post('items')
  create(@Body() dto: CreateOperationItemDto, @CurrentUser() user: CurrentUserType) {
    return this.operationsService.create(dto, user);
  }

  @Patch('items/:id')
  update(@Param('id') id: string, @Body() dto: UpdateOperationItemDto, @CurrentUser() user: CurrentUserType) {
    return this.operationsService.update(id, dto, user);
  }
}
