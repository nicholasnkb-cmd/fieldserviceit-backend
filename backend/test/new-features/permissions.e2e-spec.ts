import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Permissions & Roles (E2E)', () => {
  let app: INestApplication;
  let superToken: string;
  let adminToken: string;
  let testRoleId: string;
  let testUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Auth setup', () => {
    it('POST /v1/auth/login - super admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'super@fieldserviceit.com', password: 'admin123' })
        .expect(201);
      superToken = res.body.accessToken;
    });

    it('POST /v1/auth/login - tenant admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'admin@acme.com', password: 'admin123' })
        .expect(201);
      adminToken = res.body.accessToken;
    });
  });

  describe('Permissions', () => {
    it('GET /v1/admin/permissions - list all permissions', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/permissions')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('slug');
      expect(res.body[0]).toHaveProperty('group');
    });

    it('GET /v1/admin/permissions - tenant admin can also list', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /v1/admin/permissions - unauthenticated returns 401', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/permissions')
        .expect(401);
    });
  });

  describe('Roles', () => {
    it('GET /v1/admin/roles - list roles with permissions', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/roles')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('permissions');
      expect(res.body[0]).toHaveProperty('_count');
    });

    it('GET /v1/admin/roles/:id - get single role', async () => {
      const roles = await request(app.getHttpServer())
        .get('/v1/admin/roles')
        .set('Authorization', `Bearer ${superToken}`);

      const roleId = roles.body[0].id;
      const res = await request(app.getHttpServer())
        .get(`/v1/admin/roles/${roleId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      expect(res.body.id).toBe(roleId);
      expect(res.body).toHaveProperty('permissions');
    });

    it('POST /v1/admin/roles - create custom role', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/admin/roles')
        .set('Authorization', `Bearer ${superToken}`)
        .send({
          name: 'Test Custom Role',
          slug: 'test-custom-role',
          description: 'A role created during E2E test',
          permissionSlugs: ['tickets:read', 'tickets:create', 'assets:read'],
        })
        .expect(201);

      expect(res.body.name).toBe('Test Custom Role');
      expect(res.body.permissions).toHaveLength(3);
      testRoleId = res.body.id;
    });

    it('PATCH /v1/admin/roles/:id - update role permissions', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/admin/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ permissionSlugs: ['tickets:read', 'tickets:create', 'tickets:update', 'users:read'] })
        .expect(200);

      expect(res.body.permissions).toHaveLength(4);
    });

    it('PATCH /v1/admin/roles/:id - update role name', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/admin/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'Updated Test Role' })
        .expect(200);

      expect(res.body.name).toBe('Updated Test Role');
    });

    it('POST /v1/admin/roles - duplicate slug returns error', async () => {
      await request(app.getHttpServer())
        .post('/v1/admin/roles')
        .set('Authorization', `Bearer ${superToken}`)
        .send({
          name: 'Duplicate',
          slug: 'test-custom-role',
        })
        .expect(400);
    });

    it('DELETE /v1/admin/roles/:id - cannot delete system role', async () => {
      const roles = await request(app.getHttpServer())
        .get('/v1/admin/roles')
        .set('Authorization', `Bearer ${superToken}`);

      const systemRole = roles.body.find((r: any) => r.isSystem);
      if (systemRole) {
        await request(app.getHttpServer())
          .delete(`/v1/admin/roles/${systemRole.id}`)
          .set('Authorization', `Bearer ${superToken}`)
          .expect(400);
      }
    });
  });

  describe('User-Role assignments', () => {
    it('GET /v1/admin/users - get a test user ID', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const clientUser = res.body.data.find((u: any) => u.role === 'CLIENT');
      testUserId = clientUser?.id;
      expect(testUserId).toBeDefined();
    });

    it('POST /v1/admin/users/:userId/roles/:roleId - assign role to user', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/admin/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(201);

      expect(res.body.role.id).toBe(testRoleId);
    });

    it('GET /v1/admin/users/:id/roles - list user roles', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/admin/users/${testUserId}/roles`)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const assigned = res.body.find((ur: any) => ur.roleId === testRoleId);
      expect(assigned).toBeDefined();
    });

    it('DELETE /v1/admin/users/:userId/roles/:roleId - remove role from user', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/admin/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/v1/admin/users/${testUserId}/roles`)
        .set('Authorization', `Bearer ${superToken}`);

      const assigned = res.body.find((ur: any) => ur.roleId === testRoleId);
      expect(assigned).toBeUndefined();
    });

    it('DELETE /v1/admin/roles/:id - delete custom role', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/admin/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/v1/admin/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(404);
    });
  });

  describe('Company-level roles (TENANT_ADMIN)', () => {
    let companyRoleId: string;

    it('GET /v1/admin/company/roles - list company roles', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/company/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /v1/admin/company/roles - create company role', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/admin/company/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Company Custom Role',
          slug: 'company-custom-role',
          permissionSlugs: ['tickets:read', 'assets:read'],
        })
        .expect(201);

      expect(res.body.name).toBe('Company Custom Role');
      expect(res.body.companyId).toBeTruthy();
      companyRoleId = res.body.id;
    });

    it('PATCH /v1/admin/company/roles/:id - update company role', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/admin/company/roles/${companyRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Company Role' })
        .expect(200);

      expect(res.body.name).toBe('Updated Company Role');
    });

    it('DELETE /v1/admin/company/roles/:id - delete company role', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/admin/company/roles/${companyRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Email Verification', () => {
    let verificationToken: string;

    it('POST /v1/auth/register - new user has emailVerified=false', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: `verify-e2e-${Date.now()}@test.com`,
          password: 'Test123!',
          firstName: 'Verify',
          lastName: 'Test',
        })
        .expect(201);

      expect(res.body.user.emailVerified).toBe(false);
    });

    it('GET /v1/auth/verify-email/:token - invalid token returns error', async () => {
      await request(app.getHttpServer())
        .get('/v1/auth/verify-email/invalid-token-123')
        .expect(400);
    });

    it('POST /v1/auth/resend-verification - resend to non-existent email', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/resend-verification')
        .send({ email: 'nonexistent@test.com' })
        .expect(400);
    });
  });
});
