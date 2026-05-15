import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth & Ticket Lifecycle E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let publicToken: string;
  let ticketId: string;
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

  describe('Auth — Registration', () => {
    it('POST /v1/auth/register — creates public user with emailVerified=true', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email: 'lifecycle-public@test.com', password: 'Test123!', firstName: 'Lifecycle', lastName: 'Public' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe('lifecycle-public@test.com');
      expect(res.body.user.userType).toBe('PUBLIC');
      expect(res.body.user.emailVerified).toBe(true);
      publicToken = res.body.accessToken;
    });

    it('POST /v1/auth/register — duplicate email returns 409', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email: 'lifecycle-public@test.com', password: 'Test123!', firstName: 'Dup', lastName: 'User' })
        .expect(409);
    });

    it('POST /v1/auth/register — missing fields returns 400', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email: 'incomplete@test.com', password: 'Test123!' })
        .expect(400);
    });
  });

  describe('Auth — Login', () => {
    it('POST /v1/auth/login — admin login', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'admin@acme.com', password: 'admin123' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.email).toBe('admin@acme.com');
      adminToken = res.body.accessToken;
    });

    it('POST /v1/auth/login — wrong password returns 401', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'admin@acme.com', password: 'wrongpassword' })
        .expect(401);
    });

    it('POST /v1/auth/login — non-existent email returns 401', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'nobody@test.com', password: 'Test123!' })
        .expect(401);
    });
  });

  describe('Auth — Password Reset Flow', () => {
    it('POST /v1/auth/forgot-password — existing email returns success', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/forgot-password')
        .send({ email: 'admin@acme.com' })
        .expect(200);

      expect(res.body.message).toBeDefined();
    });

    it('POST /v1/auth/forgot-password — non-existent email returns same message (no user enumeration)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/forgot-password')
        .send({ email: 'nonexistent@test.com' })
        .expect(200);

      expect(res.body.message).toBeDefined();
    });

    it('POST /v1/auth/reset-password — invalid token returns 400', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/reset-password')
        .send({ token: 'invalid-token', password: 'NewPass123!' })
        .expect(400);
    });
  });

  describe('Auth — Token Refresh & Logout', () => {
    let refreshToken: string;

    it('POST /v1/auth/login — capture refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'admin@acme.com', password: 'admin123' })
        .expect(201);

      refreshToken = res.body.refreshToken;
    });

    it('POST /v1/auth/refresh — valid refresh token returns new tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      refreshToken = res.body.refreshToken;
    });

    it('POST /v1/auth/logout — invalidates refresh token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .send({ refreshToken })
        .expect(204);
    });

    it('POST /v1/auth/refresh — used refresh token returns 401', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe('Auth — Email Verification', () => {
    it('GET /v1/auth/verify-email/:token — invalid token returns 400', async () => {
      await request(app.getHttpServer())
        .get('/v1/auth/verify-email/fake-token')
        .expect(400);
    });

    it('POST /v1/auth/resend-verification — non-existent email returns 400', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/resend-verification')
        .send({ email: 'nobody@test.com' })
        .expect(400);
    });
  });

  describe('Health', () => {
    it('GET /v1/health — returns ok', async () => {
      const res = await request(app.getHttpServer()).get('/v1/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('Ticket — Full Lifecycle', () => {
    it('POST /v1/tickets — create ticket', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Lifecycle Test Ticket',
          description: 'Testing full ticket lifecycle',
          priority: 'HIGH',
          category: 'Software',
          subcategory: 'ERP',
          contactName: 'Lifecycle Tester',
          contactEmail: 'lifecycle@test.com',
          contactPhone: '+1234567890',
        })
        .expect(201);

      expect(res.body.title).toBe('Lifecycle Test Ticket');
      expect(res.body.ticketNumber).toMatch(/^TKT-/);
      expect(res.body.status).toBe('OPEN');
      ticketId = res.body.id;
    });

    it('GET /v1/tickets/:id — verify ticket detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(ticketId);
      expect(res.body.timeline).toBeDefined();
    });

    it('GET /v1/tickets/:id/timeline — verify initial timeline entry', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/tickets/${ticketId}/timeline`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].action).toBe('CREATED');
    });

    it('PATCH /v1/tickets/:id — transition OPEN → ASSIGNED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ASSIGNED' })
        .expect(200);

      expect(res.body.status).toBe('ASSIGNED');
    });

    it('PATCH /v1/tickets/:id — transition ASSIGNED → IN_PROGRESS', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('PATCH /v1/tickets/:id — transition IN_PROGRESS → ON_HOLD (requires reason)', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ON_HOLD' })
        .expect(400);

      const res = await request(app.getHttpServer())
        .patch(`/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ON_HOLD', onHoldReason: 'Waiting for vendor response' })
        .expect(200);

      expect(res.body.status).toBe('ON_HOLD');
      expect(res.body.onHoldReason).toBe('Waiting for vendor response');
    });

    it('PATCH /v1/tickets/:id — transition ON_HOLD → IN_PROGRESS (clears hold reason)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      expect(res.body.status).toBe('IN_PROGRESS');
      expect(res.body.onHoldReason).toBeNull();
    });

    it('PATCH /v1/tickets/:id — invalid transition returns 400', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CLOSED' })
        .expect(400);
    });

    it('PATCH /v1/tickets/:id — transition IN_PROGRESS → RESOLVED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'RESOLVED', resolution: 'Issue resolved by updating configuration' })
        .expect(200);

      expect(res.body.status).toBe('RESOLVED');
      expect(res.body.resolution).toBe('Issue resolved by updating configuration');
      expect(res.body.resolvedAt).toBeDefined();
    });

    it('PATCH /v1/tickets/:id — transition RESOLVED → CLOSED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CLOSED' })
        .expect(200);

      expect(res.body.status).toBe('CLOSED');
    });

    it('PATCH /v1/tickets/:id — reopen CLOSED ticket', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'OPEN' })
        .expect(200);

      expect(res.body.status).toBe('OPEN');
    });
  });

  describe('Ticket — Comments & Time Entries', () => {
    it('POST /v1/tickets/:id/comments — add comment', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ comment: 'This is a test comment', isInternal: false })
        .expect(201);

      expect(res.body.action).toBe('COMMENT');
    });

    it('POST /v1/tickets/:id/comments — add internal note', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ comment: 'Internal note: checking logs', isInternal: true })
        .expect(201);

      expect(res.body.action).toBe('COMMENT');
      expect(res.body.isInternal).toBe(true);
    });

    it('POST /v1/tickets/:id/time — log time entry', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/tickets/${ticketId}/time`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ duration: 45, description: 'Investigated issue', billable: true })
        .expect(201);

      expect(res.body.duration).toBe(45);
      expect(res.body.billable).toBe(true);
    });

    it('GET /v1/tickets/:id/time — list time entries', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/tickets/${ticketId}/time`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('Ticket — Attachments', () => {
    it('POST /v1/tickets/:id/attachments — add attachment', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/tickets/${ticketId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fileUrl: '/uploads/test/doc.pdf',
          fileName: 'test-document.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
        })
        .expect(201);

      expect(res.body.fileName).toBe('test-document.pdf');
    });

    it('DELETE /v1/tickets/:id/attachments/:attachmentId — remove attachment', async () => {
      const attachments = await request(app.getHttpServer())
        .get(`/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      if (attachments.body.attachments?.length > 0) {
        const attachmentId = attachments.body.attachments[0].id;
        await request(app.getHttpServer())
          .delete(`/v1/tickets/${ticketId}/attachments/${attachmentId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
      }
    });
  });

  describe('Ticket — Bulk Operations', () => {
    let ticket2Id: string;

    it('POST /v1/tickets — create second ticket for bulk ops', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Bulk Test Ticket',
          description: 'For bulk operations testing',
          priority: 'LOW',
          category: 'Hardware',
          contactName: 'Bulk Tester',
          contactEmail: 'bulk@test.com',
          contactPhone: '+1234567890',
        })
        .expect(201);

      ticket2Id = res.body.id;
    });

    it('POST /v1/tickets/bulk/status — bulk status update', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/tickets/bulk/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [ticketId, ticket2Id], status: 'ASSIGNED' })
        .expect(200);

      expect(res.body.results).toBeDefined();
      expect(res.body.results.length).toBe(2);
    });

    it('POST /v1/tickets/bulk/delete — bulk soft delete', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/tickets/bulk/delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [ticket2Id] })
        .expect(200);

      expect(res.body.results[0].success).toBe(true);
    });
  });

  describe('Ticket — Templates', () => {
    it('POST /v1/tickets/templates — create template', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/tickets/templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Network Issue Template',
          description: 'Standard template for network issues',
          category: 'Network',
          priority: 'HIGH',
        })
        .expect(201);

      expect(res.body.name).toBe('Network Issue Template');
    });

    it('GET /v1/tickets/templates/list — list templates', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tickets/templates/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('Ticket — Public User Access', () => {
    it('POST /v1/tickets — public user creates ticket', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/tickets')
        .set('Authorization', `Bearer ${publicToken}`)
        .send({
          title: 'Public Test Ticket',
          description: 'Created by public user',
          priority: 'MEDIUM',
          contactName: 'Public User',
          contactEmail: 'lifecycle-public@test.com',
          contactPhone: '+1234567890',
        })
        .expect(201);

      expect(res.body.ticketNumber).toMatch(/^TKT-PUB/);
      expect(res.body.companyId).toBeNull();
    });

    it('GET /v1/tickets — public user sees only own tickets', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tickets')
        .set('Authorization', `Bearer ${publicToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      for (const ticket of res.body.data) {
        expect(ticket.createdById).toBeDefined();
      }
    });
  });

  describe('Ticket — Export', () => {
    it('GET /v1/tickets/export/csv — export tickets as CSV', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tickets/export/csv')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('Ticket — Board View', () => {
    it('GET /v1/tickets/board — get kanban board', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tickets/board')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.columns).toBeDefined();
      expect(res.body.columns.length).toBe(6);
    });
  });

  describe('Ticket — Search & Filter', () => {
    it('GET /v1/tickets?search=Lifecycle — search by title', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tickets?search=Lifecycle')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.meta.total).toBeGreaterThan(0);
    });

    it('GET /v1/tickets?status=OPEN — filter by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tickets?status=OPEN')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.meta.page).toBe(1);
      for (const ticket of res.body.data) {
        expect(ticket.status).toBe('OPEN');
      }
    });

    it('GET /v1/tickets?page=1&limit=5 — pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tickets?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(5);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Ticket — Authorization', () => {
    it('POST /v1/tickets — unauthenticated returns 401', async () => {
      await request(app.getHttpServer())
        .post('/v1/tickets')
        .send({
          title: 'Unauthorized',
          contactName: 'Test',
          contactEmail: 'test@test.com',
          contactPhone: '+1234567890',
        })
        .expect(401);
    });

    it('PATCH /v1/tickets/:id — public user cannot update business ticket', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${publicToken}`)
        .send({ status: 'ASSIGNED' })
        .expect(403);
    });
  });
});
