import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

/**
 * E2E Test: Asset Enrollment Workflow
 * 
 * Tests the complete device enrollment workflow including:
 * 1. Creating enrollment tokens
 * 2. Device registration with MDM fields
 * 3. Tenant admin permissions on enrolled assets
 * 4. Asset visibility with permission scopes
 * 
 * Context: June 10, 2026 session added comprehensive MDM fields
 * to CreateAssetDto to support full device enrollment lifecycle.
 */
describe('Asset Enrollment Workflow (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let authToken: string;
  let refreshToken: string;
  let testUserId: string;
  let testCompanyId: string;
  let enrollmentTokenId: string;

  // Test data
  const testUser = {
    email: `test-enroll-${Date.now()}@example.com`,
    password: 'TestPassword123!',
  };

  const testDevice = {
    name: 'iPhone 13 Pro',
    deviceCategory: 'Mobile',
    ownership: 'Corporate',
    assignedUser: '', // Will be set after user creation
    osVersion: 'iOS 16.1',
    enrollmentStatus: 'Pending',
    managementMode: 'MDM',
    complianceStatus: 'Checking',
    policyProfile: 'Default-Corporate',
    mdmProvider: 'Microsoft Intune',
    encryptionStatus: 'Required',
    antivirusStatus: 'NotRequired',
    imei: '123456789012345',
    phoneNumber: '+1-555-0123',
    carrier: 'Verizon',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    // Cleanup
    if (testUserId) {
      await prismaService.execute('DELETE FROM User WHERE id = ?', [testUserId]);
    }
    if (enrollmentTokenId) {
      await prismaService.execute('DELETE FROM EnrollmentToken WHERE id = ?', [enrollmentTokenId]);
    }

    await app.close();
  });

  describe('1. User Registration & Authentication', () => {
    /**
     * Step 1: Register a tenant company user
     */
    it('should register a new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');

      authToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
      testUserId = response.body.user.id;
      testCompanyId = response.body.user.companyId;
    });

    /**
     * Step 2: Verify user can authenticate
     */
    it('should authenticate user with email and password', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body.user.email).toBe(testUser.email);
    });
  });

  describe('2. Enrollment Token Creation', () => {
    /**
     * Step 3: Create an enrollment token for device registration
     */
    it('should create enrollment token', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/cmdb/enrollment-tokens')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'iPhone Enrollment',
          description: 'Enrollment for corporate iPhones',
          platform: 'iOS',
          maxDevices: 100,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('token');
      expect(response.body.platform).toBe('iOS');

      enrollmentTokenId = response.body.id;
    });

    /**
     * Step 4: Verify enrollment token is valid and can be used
     */
    it('should validate enrollment token', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/cmdb/enrollment-tokens/${enrollmentTokenId}/validate`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('valid');
      expect(response.body.valid).toBe(true);
    });
  });

  describe('3. Device Registration with MDM Fields', () => {
    /**
     * Step 5: Register a device using enrollment token
     * Tests that all MDM fields from CreateAssetDto are accepted
     */
    it('should register device with all MDM fields', async () => {
      const deviceData = {
        ...testDevice,
        assignedUser: testUserId,
        enrollmentToken: enrollmentTokenId,
      };

      const response = await request(app.getHttpServer())
        .post('/v1/cmdb/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deviceData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(testDevice.name);
      expect(response.body.deviceCategory).toBe('Mobile');
      expect(response.body.ownership).toBe('Corporate');
      expect(response.body.enrollmentStatus).toBe('Pending');
      expect(response.body.mdmProvider).toBe('Microsoft Intune');
      expect(response.body.imei).toBe(testDevice.imei);

      // Store asset ID for later tests
      testDevice['assetId'] = response.body.id;
    });

    /**
     * Step 6: Verify device appears in asset inventory
     */
    it('should display enrolled device in inventory', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/cmdb/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ search: testDevice.name })
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.some((a: any) => a.id === testDevice['assetId'])).toBe(true);
    });

    /**
     * Step 7: Verify enrollment status can be updated
     */
    it('should update enrollment status', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/cmdb/assets/${testDevice['assetId']}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          enrollmentStatus: 'Enrolled',
          complianceStatus: 'Compliant',
        })
        .expect(200);

      expect(response.body.enrollmentStatus).toBe('Enrolled');
      expect(response.body.complianceStatus).toBe('Compliant');
    });
  });

  describe('4. Tenant Admin Permission Scopes', () => {
    /**
     * Step 8: Verify tenant admin can only see their company's devices
     * Tests permission scopes with AND array conditions
     */
    it('should enforce company isolation with permission scopes', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/cmdb/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // All returned assets should belong to the user's company
      expect(response.body.data).toBeDefined();
      expect(
        response.body.data.every((asset: any) => asset.companyId === testCompanyId)
      ).toBe(true);
    });

    /**
     * Step 9: Verify asset count respects permission scopes
     */
    it('should count only accessible assets', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/cmdb/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('5. Device Management & Compliance', () => {
    /**
     * Step 10: Update device compliance status
     */
    it('should update device compliance and policy status', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/cmdb/assets/${testDevice['assetId']}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          complianceStatus: 'NonCompliant',
          policyProfile: 'Corporate-Strict',
          encryptionStatus: 'Encrypted',
          antivirusStatus: 'Protected',
        })
        .expect(200);

      expect(response.body.complianceStatus).toBe('NonCompliant');
      expect(response.body.encryptionStatus).toBe('Encrypted');
    });

    /**
     * Step 11: Verify device can be retrieved with all MDM fields
     */
    it('should retrieve device with complete MDM details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/cmdb/assets/${testDevice['assetId']}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const asset = response.body;
      expect(asset.deviceCategory).toBeDefined();
      expect(asset.ownership).toBeDefined();
      expect(asset.enrollmentStatus).toBeDefined();
      expect(asset.complianceStatus).toBeDefined();
      expect(asset.mdmProvider).toBeDefined();
      expect(asset.imei).toBeDefined();
      expect(asset.phoneNumber).toBeDefined();
    });
  });

  describe('6. Unenrollment & Cleanup', () => {
    /**
     * Step 12: Mark device as unenrolled
     */
    it('should unenroll device', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/cmdb/assets/${testDevice['assetId']}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          enrollmentStatus: 'Unenrolled',
          complianceStatus: 'Unknown',
        })
        .expect(200);

      expect(response.body.enrollmentStatus).toBe('Unenrolled');
    });

    /**
     * Step 13: Verify device can be deleted
     */
    it('should delete unenrolled device', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/cmdb/assets/${testDevice['assetId']}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);
    });
  });

  describe('Error Handling', () => {
    /**
     * Test: Invalid MDM fields are rejected
     */
    it('should reject unknown fields due to ValidationPipe', async () => {
      const invalidData = {
        ...testDevice,
        assignedUser: testUserId,
        unknownField: 'This should not be accepted',
      };

      const response = await request(app.getHttpServer())
        .post('/v1/cmdb/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('should not exist');
    });

    /**
     * Test: Missing required fields
     */
    it('should reject asset with missing required fields', async () => {
      const incompleteData = {
        // Missing 'name' which is likely required
        deviceCategory: 'Mobile',
      };

      const response = await request(app.getHttpServer())
        .post('/v1/cmdb/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(incompleteData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    /**
     * Test: Unauthorized access
     */
    it('should reject asset creation without authentication', async () => {
      await request(app.getHttpServer())
        .post('/v1/cmdb/assets')
        .send(testDevice)
        .expect(401);
    });
  });
});
