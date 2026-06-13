import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CurrentUser } from '../../../common/types';

export function assertTenantRoleChange(
  target: { id: string; role: string },
  nextRole: string,
  actor?: CurrentUser,
) {
  const isSuperAdmin = actor?.role === 'SUPER_ADMIN';
  const assignableRoles = isSuperAdmin
    ? ['TENANT_ADMIN', 'TECHNICIAN', 'CLIENT', 'READ_ONLY']
    : ['TECHNICIAN', 'CLIENT', 'READ_ONLY'];

  if (!assignableRoles.includes(nextRole)) {
    throw new BadRequestException('Invalid role for tenant admin');
  }
  if (!isSuperAdmin && actor?.id === target.id) {
    throw new ForbiddenException('Tenant admins cannot change their own role');
  }
  if (!isSuperAdmin && target.role === 'TENANT_ADMIN') {
    throw new ForbiddenException('Only a super admin can change another tenant admin');
  }
}

export function tenantAssignableRoles(actor?: CurrentUser) {
  return actor?.role === 'SUPER_ADMIN'
    ? ['CLIENT', 'TECHNICIAN', 'TENANT_ADMIN', 'READ_ONLY']
    : ['CLIENT', 'TECHNICIAN', 'READ_ONLY'];
}
