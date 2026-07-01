import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

const data = (body: any) => body?.data ?? body;

describe('Security hardening (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const foreignCompanyId = `security-company-${Date.now()}`;
  const foreignAssetId = `security-asset-${Date.now()}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    await prisma.company.create({
      data: {
        id: foreignCompanyId,
        name: 'Security Foreign Company',
        slug: foreignCompanyId,
      },
    });
    await prisma.asset.create({
      data: {
        id: foreignAssetId,
        companyId: foreignCompanyId,
        name: 'Foreign Tenant Asset',
        assetType: 'SERVER',
      },
    });
  });

  afterAll(async () => {
    await prisma.execute('DELETE FROM Asset WHERE id = ?', [foreignAssetId]).catch(() => {});
    await prisma.execute('DELETE FROM Company WHERE id = ?', [foreignCompanyId]).catch(() => {});
    await app.close();
  });

  it('rotates refresh tokens and revokes the family when an old token is replayed', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'admin@acme.com', password: 'admin123' })
      .expect(200);
    const first = data(login.body).refreshToken;

    const refresh = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: first })
      .expect(200);
    const second = data(refresh.body).refreshToken;

    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: first })
      .expect(401);

    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: second })
      .expect(401);

    const alerts = await prisma.query<any[]>(
      `SELECT id FROM SecurityAlert
       WHERE subjectId = (SELECT id FROM User WHERE email = ? LIMIT 1)
         AND alertType = 'REFRESH_TOKEN_REUSE'
       ORDER BY createdAt DESC LIMIT 1`,
      ['admin@acme.com'],
    );
    expect(alerts).toHaveLength(1);
  });

  it('does not return an asset belonging to another tenant', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'admin@acme.com', password: 'admin123' })
      .expect(200);
    const accessToken = data(login.body).accessToken;

    await request(app.getHttpServer())
      .get(`/v1/assets/${foreignAssetId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });
});
