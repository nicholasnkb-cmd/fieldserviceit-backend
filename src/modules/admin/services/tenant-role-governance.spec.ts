import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { assertTenantRoleChange, tenantAssignableRoles } from './tenant-role-governance';

describe('tenant role governance', () => {
  const actor = {
    id: 'tenant-admin-1',
    email: 'admin@example.com',
    role: 'TENANT_ADMIN',
    userType: 'BUSINESS',
    companyId: 'company-1',
    isActive: true,
  };

  it('prevents a tenant admin from changing their own role', () => {
    expect(() => assertTenantRoleChange({ id: actor.id, role: 'TENANT_ADMIN' }, 'TECHNICIAN', actor))
      .toThrow(ForbiddenException);
  });

  it('prevents a tenant admin from changing another tenant admin', () => {
    expect(() => assertTenantRoleChange({ id: 'tenant-admin-2', role: 'TENANT_ADMIN' }, 'CLIENT', actor))
      .toThrow(ForbiddenException);
  });

  it('allows subordinate role changes but not tenant-admin promotion', () => {
    expect(() => assertTenantRoleChange({ id: 'user-1', role: 'CLIENT' }, 'TECHNICIAN', actor)).not.toThrow();
    expect(() => assertTenantRoleChange({ id: 'user-1', role: 'CLIENT' }, 'TENANT_ADMIN', actor))
      .toThrow(BadRequestException);
    expect(tenantAssignableRoles(actor)).toEqual(['CLIENT', 'TECHNICIAN', 'READ_ONLY']);
  });

  it('retains tenant-admin assignment for super admins', () => {
    const superAdmin = { ...actor, id: 'super-1', role: 'SUPER_ADMIN' };
    expect(() => assertTenantRoleChange({ id: 'tenant-admin-2', role: 'TENANT_ADMIN' }, 'CLIENT', superAdmin)).not.toThrow();
    expect(tenantAssignableRoles(superAdmin)).toContain('TENANT_ADMIN');
  });
});
