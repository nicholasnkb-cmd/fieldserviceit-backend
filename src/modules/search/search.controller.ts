import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../common/types';
import { AuthorizationExempt } from '../../common/decorators/authorization-exempt.decorator';

@Controller('search')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  @AuthorizationExempt('SearchService performs effective permission, scope, tenant, and relationship filtering', 'security-team', '2026-09-30')
  search(@Query('q') q: string, @CurrentUser() user: CurrentUserType) {
    if (!q || q.trim().length < 2) return { tickets: [], assets: [] };
    return this.searchService.search(user, q.trim());
  }
}
