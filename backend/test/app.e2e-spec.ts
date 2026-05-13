import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('FieldserviceIT E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let superToken: string;
  let ticketId: string;
  let assetId: string;
  let dispatchId: string;

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

  describe('Auth', () => {
    it('POST /v1/auth/login - admin login', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'admin@acme.com', password: 'admin123' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe('admin@acme.com');
      adminToken = res.body.accessToken;
    });

    it('POST /v1/auth/login - super admin login', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'super@fieldserviceit.com', password: 'admin123' })
        .expect(201);

      superToken = res.body.accessToken;
    });

    it('POST /v1/auth/login - bad password returns 401', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'admin@acme.com', password: 'wrong' })
        .expect(401);
    });

    it('POST /v1/auth/register - public user', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email: 'e2e-public@test.com', password: 'Test123!', firstName: 'E2E', lastName: 'Public' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
    });
  });

  describe('Health', () => {
    it('GET /v1/health returns ok', async () => {
      const res = await request(app.getHttpServer()).get('/v1/health').expect(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('Tickets', () => {
    it('GET /v1/tickets - list tickets', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      if (res.body.data.length > 0) ticketId = res.body.data[0].id;
    });

    it('GET /v1/tickets?page=1&limit=10&status=OPEN', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tickets?page=1&limit=10&status=OPEN')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.meta.page).toBe(1);
    });

    it('POST /v1/tickets - create ticket', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'E2E Test Ticket',
          description: 'Created during E2E test',
          priority: 'HIGH',
          category: 'Software',
          subcategory: 'ERP',
          contactName: 'E2E Tester',
          contactEmail: 'e2e@test.com',
        })
        .expect(201);

      expect(res.body.title).toBe('E2E Test Ticket');
      expect(res.body.ticketNumber).toMatch(/^TKT-\d+/);
      ticketId = res.body.id;
    });

    it('GET /v1/tickets/:id - get ticket detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(ticketId);
    });

    it('PATCH /v1/tickets/:id - update ticket status transition (OPEN -> ASSIGNED)', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ASSIGNED' })
        .expect(200);
    });

    it('PATCH /v1/tickets/:id - invalid transition returns 400', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'RESOLVED' })
        .expect(400);
    });
  });

  describe('Assets', () => {
    it('GET /v1/assets - list assets', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/assets')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      if (res.body.data.length > 0) assetId = res.body.data[0].id;
    });

    it('GET /v1/assets?page=1&limit=10&search=WS', async () => {
      await request(app.getHttpServer())
        .get('/v1/assets?page=1&limit=10&search=WS')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('POST /v1/assets - create asset', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/assets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'E2E-Asset',
          assetType: 'SERVER',
          serialNumber: 'E2E-SN-001',
          manufacturer: 'Dell',
          model: 'PowerEdge',
        })
        .expect(201);

      expect(res.body.name).toBe('E2E-Asset');
      assetId = res.body.id;
    });

    it('DELETE /v1/assets/:id - soft delete asset', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/assets/${assetId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Search', () => {
    it('GET /v1/search?q=server', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/search?q=server')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body.tickets)).toBe(true);
      expect(Array.isArray(res.body.assets)).toBe(true);
    });
  });

  describe('Dispatch', () => {
    it('GET /v1/dispatch - list dispatches', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/dispatch')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Users', () => {
    it('GET /v1/users/me - current user profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/users/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.email).toBe('admin@acme.com');
    });

    it('GET /v1/users/me - unauthenticated returns 401', async () => {
      await request(app.getHttpServer()).get('/v1/users/me').expect(401);
    });
  });

  describe('Settings', () => {
    it('GET /v1/settings - get company settings', async () => {
      await request(app.getHttpServer())
        .get('/v1/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Admin (SUPER_ADMIN)', () => {
    it('GET /v1/admin/users - list all users', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/users?page=1&limit=10')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/admin/companies - list all companies', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/companies?page=1&limit=10')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /v1/admin/audit-logs - list audit logs', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/audit-logs?page=1&limit=5')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /v1/admin/stats - global stats', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/stats')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);
    });

    it('GET /v1/admin/roles - list roles', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/roles')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('Upload Validation', () => {
    it('POST /v1/uploads/avatar - rejects non-image file type', async () => {
      await request(app.getHttpServer())
        .post('/v1/uploads/avatar')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('avatar', Buffer.from('not an image'), 'test.txt')
        .expect(422);
    });

    it('POST /v1/uploads/signature - rejects oversized file', async () => {
      const largeBuf = Buffer.alloc(3 * 1024 * 1024, 'a');
      await request(app.getHttpServer())
        .post('/v1/uploads/signature')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('signature', largeBuf, 'large.png')
        .expect(413);
    });
  });

  describe('RMM Integration', () => {
    it('GET /v1/integrations/rmm/providers - list providers', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/integrations/rmm/providers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.providers).toEqual(['connectwise', 'ninjaone', 'datto']);
    });

    it('POST /v1/integrations/rmm/sync-asset - sync single asset', async () => {
      await request(app.getHttpServer())
        .post('/v1/integrations/rmm/sync-asset')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'connectwise', assetData: { name: 'E2E-CW-Test', assetType: 'SERVER' } })
        .expect(201);
    });

    it('POST /v1/integrations/rmm/alert - create ticket from alert', async () => {
      await request(app.getHttpServer())
        .post('/v1/integrations/rmm/alert')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'ninjaone', alert: { title: 'E2E Alert Test', severity: 'critical' } })
        .expect(201);
    });

    it('POST /v1/integrations/rmm/configs - save provider config', async () => {
      await request(app.getHttpServer())
        .post('/v1/integrations/rmm/configs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'datto', credentials: { apiToken: 'test', siteId: 'test' } })
        .expect(201);
    });

    it('GET /v1/integrations/rmm/configs - list configs', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/integrations/rmm/configs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
    });

    it('POST /v1/integrations/rmm/sync-now/connectwise - trigger manual sync', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/integrations/rmm/sync-now/connectwise')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(res.body.synced).toBe(true);
    });
  });

  describe('Reports', () => {
    it('GET /v1/reports/tickets - ticket summary', async () => {
      await request(app.getHttpServer())
        .get('/v1/reports/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Tenant Admin', () => {
    it('GET /v1/admin/company/users - list company users', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/company/users?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });
});
