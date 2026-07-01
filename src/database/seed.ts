/**
 * Database seed script (ACTIVE — wired to `npm run seed`).
 * Uses raw SQL via DatabaseService.
 * A parallel Prisma seed exists at `prisma/seed.ts` for reference/Studio.
 * Keep BOTH files in sync when changing seed data.
 */

import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { DatabaseService } from './database.service';

const logger = new Logger('Seed');

type PlanSeed = {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  maxUsers: number;
  maxTickets: number;
  sortOrder: number;
  features: Record<string, boolean>;
};

const now = () => new Date();

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    const raw = rest.join('=').trim();
    const value = raw.replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function upsertByUnique(db: DatabaseService, table: string, uniqueColumn: string, uniqueValue: any, data: Record<string, any>) {
  const rows = await db.query<any[]>(`SELECT * FROM \`${table}\` WHERE \`${uniqueColumn}\` = ? LIMIT 1`, [uniqueValue]);
  if (rows[0]) {
    const updateData: Record<string, any> = { ...data };
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    const keys = Object.keys(updateData).filter((key) => updateData[key] !== undefined);
    if (keys.length) {
      await db.execute(
        `UPDATE \`${table}\` SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')} WHERE \`${uniqueColumn}\` = ?`,
        [...keys.map((key) => updateData[key]), uniqueValue],
      );
    }
    const updated = await db.query<any[]>(`SELECT * FROM \`${table}\` WHERE \`${uniqueColumn}\` = ? LIMIT 1`, [uniqueValue]);
    return updated[0];
  }

  const insertData: Record<string, any> = { id: data.id || crypto.randomUUID(), createdAt: now(), ...data };
  const keys = Object.keys(insertData).filter((key) => insertData[key] !== undefined);
  await db.execute(
    `INSERT INTO \`${table}\` (${keys.map((key) => `\`${key}\``).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    keys.map((key) => insertData[key]),
  );
  return insertData;
}

async function ensurePlans(db: DatabaseService) {
  const plans: PlanSeed[] = [
    {
      id: 'plan-free',
      name: 'Free',
      description: 'Basic ticket tracking for individuals',
      monthlyPrice: 0,
      maxUsers: 1,
      maxTickets: 50,
      sortOrder: 0,
      features: { tickets: true, emailNotifications: true, publicSubmit: true },
    },
    {
      id: 'plan-starter',
      name: 'Starter',
      description: 'For individuals who need higher-volume support tracking',
      monthlyPrice: 29,
      maxUsers: 1,
      maxTickets: -1,
      sortOrder: 1,
      features: { tickets: true, dispatch: true, assets: true, emailNotifications: true, publicSubmit: true, csvExport: true, apiAccess: true },
    },
    {
      id: 'plan-business',
      name: 'Business',
      description: 'The single company plan with ITSM, MDM, RMM, SLA, workflows, and reporting',
      monthlyPrice: 79,
      maxUsers: -1,
      maxTickets: -1,
      sortOrder: 2,
      features: {
        tickets: true,
        dispatch: true,
        assets: true,
        emailNotifications: true,
        publicSubmit: true,
        csvExport: true,
        apiAccess: true,
        rmmIntegration: true,
        slaManagement: true,
        workflows: true,
        reporting: true,
        auditLogs: true,
        branding: true,
        timeTracking: true,
        contracts: true,
        kb: true,
      },
    },
  ];

  for (const plan of plans) {
    await upsertByUnique(db, 'Plan', 'name', plan.name, {
      ...plan,
      features: JSON.stringify(plan.features),
      isActive: 1,
    });
  }
  return plans;
}

async function ensurePermissionsAndRoles(db: DatabaseService) {
  const permissions = [
    ['users.manage', 'Manage users', 'Admin'],
    ['roles.manage', 'Manage roles', 'Admin'],
    ['companies.manage', 'Manage companies', 'Admin'],
    ['ai-agent.use', 'Use AI agent', 'Automation'],
    ['settings.manage', 'Manage settings', 'Admin'],
    ['tickets.manage', 'Manage tickets', 'Service Desk'],
    ['tickets.view', 'View tickets', 'Service Desk'],
    ['assets.manage', 'Manage assets and MDM devices', 'MDM'],
    ['dispatch.manage', 'Manage dispatch', 'Field Service'],
    ['reports.view', 'View reports', 'Reporting'],
    ['billing.manage', 'Manage billing', 'Billing'],
    ['audit.view', 'View audit logs', 'Audit'],
  ];

  for (const [slug, name, group] of permissions) {
    await upsertByUnique(db, 'Permission', 'slug', slug, {
      id: `perm-${slug}`,
      slug,
      name,
      grp: group,
      description: name,
    });
  }

  const roles = [
    ['SUPER_ADMIN', 'super-admin', 'Full system access across all tenants'],
    ['GLOBAL_TECH', 'global-tech', 'Platform technician for free and starter individual tickets'],
    ['TENANT_ADMIN', 'tenant-admin', 'Company administrator'],
    ['TECHNICIAN', 'technician', 'Field service technician'],
    ['CLIENT', 'client', 'End user/requestor'],
    ['READ_ONLY', 'read-only', 'View-only access'],
  ];

  for (const [name, slug, description] of roles) {
    await upsertByUnique(db, 'Role', 'slug', slug, {
      id: `role-${slug}`,
      name,
      slug,
      description,
      companyId: null,
      isSystem: 1,
    });
  }

  const rolePermissionMap: Record<string, string[]> = {
    'super-admin': permissions.map(([slug]) => slug),
    'tenant-admin': ['users.manage', 'roles.manage', 'ai-agent.use', 'settings.manage', 'tickets.manage', 'tickets.view', 'assets.manage', 'dispatch.manage', 'reports.view', 'billing.manage', 'audit.view'],
    technician: ['ai-agent.use', 'tickets.manage', 'tickets.view', 'assets.manage', 'dispatch.manage'],
    client: ['tickets.view'],
    'read-only': ['tickets.view', 'reports.view'],
  };

  for (const [roleSlug, permissionSlugs] of Object.entries(rolePermissionMap)) {
    const roleRows = await db.query<any[]>(`SELECT id FROM Role WHERE slug = ? LIMIT 1`, [roleSlug]);
    const roleId = roleRows[0]?.id;
    if (!roleId) continue;
    for (const permissionSlug of permissionSlugs) {
      const permRows = await db.query<any[]>(`SELECT id FROM Permission WHERE slug = ? LIMIT 1`, [permissionSlug]);
      const permissionId = permRows[0]?.id;
      if (!permissionId) continue;
      await db.execute(
        `INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt) VALUES (?, ?, ?)`,
        [roleId, permissionId, now()],
      );
    }
  }
}

async function ensureDemoTenant(db: DatabaseService) {
  const company = await upsertByUnique(db, 'Company', 'slug', 'acme', {
    id: 'company-acme',
    name: 'Acme Field Services',
    slug: 'acme',
    domain: 'acme.example.com',
    settings: JSON.stringify({
      timezone: 'America/New_York',
      locale: 'en-US',
      featureOverrides: {},
      restrictions: {},
    }),
    branding: JSON.stringify({ primaryColor: '#2563eb' }),
    isActive: 1,
  });

  const businessRows = await db.query<any[]>(`SELECT id FROM Plan WHERE name = 'Business' LIMIT 1`);
  if (businessRows[0]) {
    await upsertByUnique(db, 'CompanyPlan', 'companyId', company.id, {
      id: 'company-plan-acme',
      companyId: company.id,
      planId: businessRows[0].id,
      status: 'ACTIVE',
      currentPeriodStart: now(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  }

  return company;
}

async function ensureUsers(db: DatabaseService, companyId: string) {
  const passwordHash = await bcrypt.hash('admin123', 12);
  const techHash = await bcrypt.hash('tech123', 12);
  const clientHash = await bcrypt.hash('client123', 12);

  const users = [
    { id: 'user-super-admin', email: 'super@fieldserviceit.com', firstName: 'Super', lastName: 'Admin', role: 'SUPER_ADMIN', userType: 'BUSINESS', companyId, passwordHash },
    { id: 'user-acme-admin', email: 'admin@acme.com', firstName: 'Acme', lastName: 'Admin', role: 'TENANT_ADMIN', userType: 'BUSINESS', companyId, passwordHash },
    { id: 'user-acme-tech1', email: 'tech1@acme.com', firstName: 'Taylor', lastName: 'Tech', role: 'TECHNICIAN', userType: 'BUSINESS', companyId, passwordHash: techHash },
    { id: 'user-acme-tech2', email: 'tech2@acme.com', firstName: 'Jordan', lastName: 'Field', role: 'TECHNICIAN', userType: 'BUSINESS', companyId, passwordHash: techHash },
    { id: 'user-acme-client', email: 'client@acme.com', firstName: 'Casey', lastName: 'Client', role: 'CLIENT', userType: 'BUSINESS', companyId, passwordHash: clientHash },
  ];

  for (const user of users) {
    const saved = await upsertByUnique(db, 'User', 'email', user.email, {
      ...user,
      phone: user.email.startsWith('super') ? '+1 555 0100' : '+1 555 0101',
      location: 'New York, NY',
      preferredContactMethod: 'email',
      timezone: 'America/New_York',
      isActive: 1,
      emailVerified: 1,
    });

    const roleRows = await db.query<any[]>(`SELECT id FROM Role WHERE name = ? LIMIT 1`, [user.role]);
    if (roleRows[0]) {
      await db.execute(`INSERT IGNORE INTO UserRole (userId, roleId, createdAt) VALUES (?, ?, ?)`, [saved.id, roleRows[0].id, now()]);
    }
  }
}

async function ensureOperationalDemoData(db: DatabaseService, companyId: string) {
  const adminRows = await db.query<any[]>(`SELECT id FROM User WHERE email = 'admin@acme.com' LIMIT 1`);
  const techRows = await db.query<any[]>(`SELECT id FROM User WHERE email = 'tech1@acme.com' LIMIT 1`);
  const adminId = adminRows[0]?.id || 'user-acme-admin';
  const techId = techRows[0]?.id || 'user-acme-tech1';

  await upsertByUnique(db, 'Asset', 'serialNumber', 'FST-MDM-001', {
    id: 'asset-mdm-laptop-001',
    name: 'Executive Windows Laptop',
    assetType: 'LAPTOP',
    deviceCategory: 'LAPTOP',
    serialNumber: 'FST-MDM-001',
    manufacturer: 'Lenovo',
    model: 'ThinkPad X1',
    os: 'Windows',
    osVersion: '11 Pro',
    status: 'active',
    ownership: 'COMPANY',
    assignedUser: 'executive@acme.com',
    enrollmentStatus: 'ENROLLED',
    managementMode: 'AGENT',
    mdmProvider: 'FieldserviceIT',
    mdmDeviceId: crypto.randomUUID(),
    lastCheckInAt: now(),
    complianceStatus: 'COMPLIANT',
    encryptionStatus: 'ENCRYPTED',
    firewallEnabled: 1,
    antivirusStatus: 'PROTECTED',
    passcodeCompliant: 1,
    batteryLevel: 88,
    policyProfile: 'Baseline',
    companyId,
  });

  await upsertByUnique(db, 'Ticket', 'ticketNumber', 'FST-1001', {
    id: 'ticket-fst-1001',
    ticketNumber: 'FST-1001',
    title: 'New hire laptop enrollment',
    description: 'Prepare and enroll a managed laptop for a new hire.',
    contactName: 'Morgan Lee',
    contactEmail: 'morgan.lee@acme.com',
    contactPhone: '+1 555 0130',
    category: 'Device Management',
    subcategory: 'Enrollment',
    location: 'New York HQ',
    status: 'OPEN',
    priority: 'MEDIUM',
    type: 'REQUEST',
    companyId,
    createdById: adminId,
    assignedToId: techId,
    assetId: 'asset-mdm-laptop-001',
  });

  await db.execute(
    `INSERT IGNORE INTO MdmCommand (id, companyId, assetId, action, payload, status, requestedById, createdAt, updatedAt)
     VALUES (?, ?, ?, 'SYNC', ?, 'PENDING', ?, ?, ?)`,
    [id('mdm-command'), companyId, 'asset-mdm-laptop-001', JSON.stringify({ reason: 'Initial demo sync' }), adminId, now(), now()],
  );
}

async function printCounts(db: DatabaseService) {
  const tables = ['Company', 'User', 'Plan', 'CompanyPlan', 'Role', 'Permission', 'RolePermission', 'UserRole', 'Asset', 'Ticket', 'MdmCommand'];
  for (const table of tables) {
    const rows = await db.query<any[]>(`SELECT COUNT(*) as count FROM \`${table}\``);
    logger.log(`${table}: ${rows[0]?.count || 0}`);
  }
}

async function main() {
  loadEnv();
  const db = new DatabaseService();
  await db.onModuleInit();
  await ensurePlans(db);
  await ensurePermissionsAndRoles(db);
  const company = await ensureDemoTenant(db);
  await ensureUsers(db, company.id);
  await ensureOperationalDemoData(db, company.id);
  await printCounts(db);
  await db.$disconnect();
}

main().catch((err) => {
  logger.error('[seed] failed: ' + (err?.message || err));
  process.exit(1);
});
