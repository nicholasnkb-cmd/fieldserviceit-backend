import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

describe('Asset enrollment and lifecycle (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let assetId: string;
  let enrollmentTokenId: string;

  const device = {
    name: `E2E managed device ${Date.now()}`,
    assetType: 'COMPUTER',
    deviceCategory: 'MOBILE',
    ownership: 'COMPANY',
    os: 'iOS',
    osVersion: '16.1',
    enrollmentStatus: 'PENDING',
    managementMode: 'MDM',
    complianceStatus: 'CHECKING',
    policyProfile: 'Default-Corporate',
    mdmProvider: 'Microsoft Intune',
    encryptionStatus: 'REQUIRED',
    antivirusStatus: 'NOT_REQUIRED',
    imei: '123456789012345',
    phoneNumber: '+1-555-0123',
    carrier: 'Verizon',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'admin@acme.com', password: 'admin123' })
      .expect(200);
    authToken = login.body.accessToken;
  });

  afterAll(async () => {
    if (assetId) await prisma.execute('DELETE FROM Asset WHERE id = ?', [assetId]);
    if (enrollmentTokenId) await prisma.execute('DELETE FROM MdmEnrollmentToken WHERE id = ?', [enrollmentTokenId]);
    await app.close();
  });

  it('creates and lists an enrollment token', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/assets/mdm/enrollment-tokens')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ttlHours: 24, deviceCategory: 'MOBILE', ownership: 'COMPANY', policyProfile: 'Default-Corporate' })
      .expect(201);

    enrollmentTokenId = created.body.id;
    expect(created.body.token).toBeDefined();

    const listed = await request(app.getHttpServer())
      .get('/v1/assets/mdm/enrollment-tokens')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(listed.body.some((token: { id: string }) => token.id === enrollmentTokenId)).toBe(true);
  });

  it('creates a managed asset with the current API contract', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/assets')
      .set('Authorization', `Bearer ${authToken}`)
      .send(device)
      .expect(201);

    assetId = response.body.id;
    expect(response.body.name).toBe(device.name);
    expect(response.body.assetType).toBe('COMPUTER');
    expect(response.body.mdmProvider).toBe('Microsoft Intune');
  });

  it('lists, updates, and retrieves the managed asset', async () => {
    const listed = await request(app.getHttpServer())
      .get('/v1/assets')
      .set('Authorization', `Bearer ${authToken}`)
      .query({ search: device.name })
      .expect(200);
    expect(listed.body.data.some((asset: { id: string }) => asset.id === assetId)).toBe(true);

    const updated = await request(app.getHttpServer())
      .patch(`/v1/assets/${assetId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ enrollmentStatus: 'ENROLLED', complianceStatus: 'COMPLIANT', encryptionStatus: 'ENCRYPTED' })
      .expect(200);
    expect(updated.body.enrollmentStatus).toBe('ENROLLED');
    expect(updated.body.complianceStatus).toBe('COMPLIANT');

    const detail = await request(app.getHttpServer())
      .get(`/v1/assets/${assetId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(detail.body.imei).toBe(device.imei);
  });

  it('rejects unknown fields and unauthenticated creation', async () => {
    await request(app.getHttpServer())
      .post('/v1/assets')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ...device, unknownField: 'not allowed' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/v1/assets')
      .send(device)
      .expect(401);
  });

  it('retires the asset and exposes it in the retired inventory', async () => {
    await request(app.getHttpServer())
      .delete(`/v1/assets/${assetId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const retired = await request(app.getHttpServer())
      .get('/v1/assets/retired')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(retired.body.data.some((asset: { id: string }) => asset.id === assetId)).toBe(true);
  });
});
