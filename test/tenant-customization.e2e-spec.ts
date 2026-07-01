import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Tenant customization E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let original: any;
  let historyId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'admin@acme.com', password: 'admin123' })
      .expect(200);
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    if (original && adminToken) {
      await request(app.getHttpServer())
        .put('/v1/settings/branding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(original.branding || {});
      await request(app.getHttpServer())
        .put('/v1/settings/customization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(original.settings?.customization || {});
    }
    await app.close();
  });

  it('loads tenant settings', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    original = response.body;
    expect(response.body.id).toBeDefined();
  });

  it('publishes branding and customization', async () => {
    const branding = await request(app.getHttpServer())
      .put('/v1/settings/branding')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ primaryColor: '#123456', companyName: 'E2E Tenant' })
      .expect(200);
    expect(branding.body.branding.primaryColor).toBe('#123456');

    const customization = await request(app.getHttpServer())
      .put('/v1/settings/customization')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ banner: { enabled: true, text: 'E2E maintenance notice', tone: 'warning' } })
      .expect(200);
    expect(customization.body.settings.customization.banner.enabled).toBe(true);
  });

  it('lists tenant-scoped history and restores a version', async () => {
    const history = await request(app.getHttpServer())
      .get('/v1/settings/history')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(history.body)).toBe(true);
    expect(history.body.length).toBeGreaterThan(0);
    historyId = history.body[0].id;

    const restored = await request(app.getHttpServer())
      .post(`/v1/settings/history/${historyId}/rollback`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    expect(restored.body.branding).toBeDefined();
    expect(restored.body.settings).toBeDefined();
  });
});
