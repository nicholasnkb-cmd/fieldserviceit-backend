import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PERMISSIONS = [
  { name: 'View Tickets', slug: 'tickets:read', group: 'Tickets' },
  { name: 'Create Tickets', slug: 'tickets:create', group: 'Tickets' },
  { name: 'Update Tickets', slug: 'tickets:update', group: 'Tickets' },
  { name: 'Delete Tickets', slug: 'tickets:delete', group: 'Tickets' },
  { name: 'Assign Tickets', slug: 'tickets:assign', group: 'Tickets' },
  { name: 'Resolve Tickets', slug: 'tickets:resolve', group: 'Tickets' },
  { name: 'View Users', slug: 'users:read', group: 'Users' },
  { name: 'Create Users', slug: 'users:create', group: 'Users' },
  { name: 'Update Users', slug: 'users:update', group: 'Users' },
  { name: 'Delete Users', slug: 'users:delete', group: 'Users' },
  { name: 'View Assets', slug: 'assets:read', group: 'Assets' },
  { name: 'Create Assets', slug: 'assets:create', group: 'Assets' },
  { name: 'Update Assets', slug: 'assets:update', group: 'Assets' },
  { name: 'Delete Assets', slug: 'assets:delete', group: 'Assets' },
  { name: 'View Reports', slug: 'reports:read', group: 'Reports' },
  { name: 'Export Data', slug: 'data:export', group: 'Data' },
  { name: 'View Analytics', slug: 'analytics:read', group: 'Analytics' },
  { name: 'Manage SLA', slug: 'sla:manage', group: 'SLA' },
  { name: 'Manage Workflows', slug: 'workflows:manage', group: 'Workflows' },
  { name: 'Manage RMM', slug: 'rmm:manage', group: 'RMM' },
  { name: 'Manage KB', slug: 'kb:manage', group: 'Knowledge Base' },
  { name: 'View Time Entries', slug: 'time:read', group: 'Time Tracking' },
  { name: 'Create Time Entries', slug: 'time:create', group: 'Time Tracking' },
  { name: 'Manage Company Settings', slug: 'company:settings', group: 'Company' },
  { name: 'Manage Roles', slug: 'roles:manage', group: 'Roles' },
];

async function main() {
  // Seed permissions
  const seededPermissions: Record<string, string> = {};
  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { slug: p.slug },
      update: {},
      create: p,
    });
    seededPermissions[p.slug] = perm.id;
  }
  console.log(`Seeded ${PERMISSIONS.length} permissions`);

  // Seed system roles
  const rolePermissionMap: Record<string, string[]> = {
    'super-admin': PERMISSIONS.map((p) => p.slug),
    'tenant-admin': [
      'tickets:read', 'tickets:create', 'tickets:update', 'tickets:delete',
      'tickets:assign', 'tickets:resolve',
      'users:read', 'users:create', 'users:update', 'users:delete',
      'assets:read', 'assets:create', 'assets:update', 'assets:delete',
      'reports:read', 'data:export', 'analytics:read',
      'sla:manage', 'workflows:manage', 'rmm:manage', 'kb:manage',
      'time:read', 'time:create', 'company:settings', 'roles:manage',
    ],
    'technician': [
      'tickets:read', 'tickets:create', 'tickets:update',
      'tickets:assign', 'tickets:resolve',
      'assets:read',
      'time:read', 'time:create',
    ],
    'client': [
      'tickets:read', 'tickets:create',
    ],
    'read-only': [
      'tickets:read', 'assets:read', 'reports:read',
    ],
  };

  const company = await prisma.company.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corp',
      slug: 'acme-corp',
      domain: 'acme.com',
      settings: JSON.stringify({ timezone: 'America/New_York', locale: 'en-US' }),
    },
  });

  for (const [slug, permSlugs] of Object.entries(rolePermissionMap)) {
    const displayName = slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const isSystem = slug === 'super-admin';

    const existingRole = isSystem
      ? await prisma.role.findFirst({ where: { slug, companyId: null } })
      : await prisma.role.findUnique({ where: { slug_companyId: { slug, companyId: company.id } } });

    const role = existingRole
      ? await prisma.role.update({
          where: { id: existingRole.id },
          data: { name: displayName, description: `${displayName} role` },
        })
      : await prisma.role.create({
          data: {
            name: displayName,
            slug,
            description: `${displayName} role`,
            companyId: isSystem ? null : company.id,
            isSystem,
          },
        });

    for (const permSlug of permSlugs) {
      const permId = seededPermissions[permSlug];
      if (permId) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permId } },
          update: {},
          create: { roleId: role.id, permissionId: permId },
        });
      }
    }
    console.log(`Seeded role "${displayName}" with ${permSlugs.length} permissions`);
  }

  // Seed users with role assignments
  const admin = await prisma.user.upsert({
    where: { email: 'admin@acme.com' },
    update: {},
    create: {
      email: 'admin@acme.com',
      passwordHash: await bcrypt.hash('admin123', 12),
      firstName: 'Admin',
      lastName: 'User',
      role: 'TENANT_ADMIN',
      companyId: company.id,
    },
  });
  await assignRole(admin.id, company.id, 'tenant-admin');

  const tech1 = await prisma.user.upsert({
    where: { email: 'tech1@acme.com' },
    update: {},
    create: {
      email: 'tech1@acme.com',
      passwordHash: await bcrypt.hash('tech123', 12),
      firstName: 'John',
      lastName: 'Smith',
      role: 'TECHNICIAN',
      companyId: company.id,
    },
  });
  await assignRole(tech1.id, company.id, 'technician');

  const tech2 = await prisma.user.upsert({
    where: { email: 'tech2@acme.com' },
    update: {},
    create: {
      email: 'tech2@acme.com',
      passwordHash: await bcrypt.hash('tech123', 12),
      firstName: 'Jane',
      lastName: 'Doe',
      role: 'TECHNICIAN',
      companyId: company.id,
    },
  });
  await assignRole(tech2.id, company.id, 'technician');

  const client = await prisma.user.upsert({
    where: { email: 'client@acme.com' },
    update: {},
    create: {
      email: 'client@acme.com',
      passwordHash: await bcrypt.hash('client123', 12),
      firstName: 'Bob',
      lastName: 'Johnson',
      role: 'CLIENT',
      companyId: company.id,
    },
  });
  await assignRole(client.id, company.id, 'client');

  // Seed super admin
  const superAdmin = await prisma.user.upsert({
    where: { email: 'super@fieldserviceit.com' },
    update: {},
    create: {
      email: 'super@fieldserviceit.com',
      passwordHash: await bcrypt.hash('admin123', 12),
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
    },
  });
  const superAdminRole = await prisma.role.findFirst({ where: { slug: 'super-admin', companyId: null } });
  if (superAdminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: superAdmin.id, roleId: superAdminRole.id } },
      update: {},
      create: { userId: superAdmin.id, roleId: superAdminRole.id },
    });
  }

  // Seed assets
  const asset1 = await prisma.asset.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'WS-001',
      assetType: 'COMPUTER',
      serialNumber: 'SN-ABC-123',
      manufacturer: 'Dell',
      model: 'OptiPlex 7080',
      os: 'Windows 11',
      cpu: 'Intel i7-10700',
      ram: '32GB',
      storage: '512GB SSD',
      ipAddress: '192.168.1.100',
      location: 'Main Office - Floor 2',
      companyId: company.id,
    },
  });

  const asset2 = await prisma.asset.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'SRV-DB-01',
      assetType: 'SERVER',
      serialNumber: 'SN-XYZ-789',
      manufacturer: 'HP',
      model: 'ProLiant DL380',
      os: 'Windows Server 2022',
      cpu: 'Intel Xeon Gold 6248',
      ram: '128GB',
      storage: '4TB SSD',
      ipAddress: '10.0.1.10',
      location: 'Data Center',
      companyId: company.id,
    },
  });

  // Seed SLAs
  await prisma.sLA.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Critical SLA',
      companyId: company.id,
      priority: 'CRITICAL',
      responseTimeMin: 15,
      resolutionTimeMin: 120,
      escalateAfterMin: 60,
    },
  });

  await prisma.sLA.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Standard SLA',
      companyId: company.id,
      priority: 'MEDIUM',
      responseTimeMin: 60,
      resolutionTimeMin: 480,
      escalateAfterMin: 240,
    },
  });

  // Seed tickets
  const ticket1 = await prisma.ticket.upsert({
    where: { ticketNumber: 'TKT-ACME-00001' },
    update: {},
    create: {
      ticketNumber: 'TKT-ACME-00001',
      title: 'Email not sending from Outlook',
      description: 'User cannot send emails from Outlook since this morning. Receiving works fine.',
      status: 'OPEN',
      priority: 'HIGH',
      type: 'INCIDENT',
      companyId: company.id,
      createdById: client.id,
      assetId: asset1.id,
    },
  });

  await prisma.ticket.upsert({
    where: { ticketNumber: 'TKT-ACME-00002' },
    update: {},
    create: {
      ticketNumber: 'TKT-ACME-00002',
      title: 'New employee workstation setup',
      description: 'Need to set up a new workstation for the incoming developer - Mark Williams.',
      status: 'ASSIGNED',
      priority: 'MEDIUM',
      type: 'REQUEST',
      companyId: company.id,
      createdById: admin.id,
      assignedToId: tech1.id,
    },
  });

  await prisma.ticket.upsert({
    where: { ticketNumber: 'TKT-ACME-00003' },
    update: {},
    create: {
      ticketNumber: 'TKT-ACME-00003',
      title: 'Database server performance degradation',
      description: 'SRV-DB-01 is showing high CPU usage (95%+). Queries are timing out.',
      status: 'IN_PROGRESS',
      priority: 'CRITICAL',
      type: 'PROBLEM',
      companyId: company.id,
      createdById: admin.id,
      assignedToId: tech2.id,
      assetId: asset2.id,
    },
  });

  await prisma.ticketTimeline.create({
    data: {
      ticketId: ticket1.id,
      actorId: client.id,
      action: 'created',
      comment: 'Ticket created via web portal',
    },
  });

  await prisma.workflow.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Critical Ticket Auto-Assign',
      description: 'Auto-assign critical tickets to senior technician',
      triggerOn: 'ticket.created',
      companyId: company.id,
      steps: {
        create: [
          { stepOrder: 1, action: 'assign_technician', config: JSON.stringify({ userId: tech2.id }) },
          { stepOrder: 2, action: 'notify', config: JSON.stringify({ channel: 'email' }) },
        ],
      },
    },
  });

  console.log('Seed data created successfully');
  console.log({ company: company.name, admin: admin.email, tech1: tech1.email, tech2: tech2.email, client: client.email });
  console.log('Passwords: admin123, tech123, client123');
}

async function assignRole(userId: string, companyId: string, roleSlug: string) {
  const role = await prisma.role.findFirst({
    where: { slug: roleSlug, companyId },
  });
  if (role) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      update: {},
      create: { userId, roleId: role.id },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
