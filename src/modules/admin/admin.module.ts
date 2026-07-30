import { Module } from '@nestjs/common';
import { AdminController } from './controllers/admin.controller';
import { ScimController } from './controllers/scim.controller';
import { AccessRequestsController } from './controllers/access-requests.controller';
import { AdminService } from './services/admin.service';
import { AccessGovernanceService } from './services/access-governance.service';
import { ScimService } from './services/scim.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ScimTokenGuard } from '../../common/guards/scim-token.guard';
import { TicketsModule } from '../tickets/tickets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformOperationsService } from './services/platform-operations.service';
import { CompanyInvitationsController, InvitationAcceptanceController } from './controllers/tenant-invitations.controller';
import { TenantInvitationsService } from './services/tenant-invitations.service';

@Module({
  imports: [AuditLogModule, TicketsModule, NotificationsModule],
  controllers: [AdminController, ScimController, AccessRequestsController, CompanyInvitationsController, InvitationAcceptanceController],
  providers: [AdminService, PlatformOperationsService, AccessGovernanceService, ScimService, ScimTokenGuard, TenantInvitationsService],
  exports: [AdminService],
})
export class AdminModule {}
