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

@Module({
  imports: [AuditLogModule, TicketsModule, NotificationsModule],
  controllers: [AdminController, ScimController, AccessRequestsController],
  providers: [AdminService, AccessGovernanceService, ScimService, ScimTokenGuard],
  exports: [AdminService],
})
export class AdminModule {}
