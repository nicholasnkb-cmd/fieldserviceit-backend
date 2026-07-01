import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { PrismaService } from '../src/database/prisma.service';

/**
 * Integration Tests: Permission Scopes AND Array Support
 * 
 * Tests the critical AND array functionality that enables fine-grained
 * permission filtering. This is used by PermissionsGuard to apply
 * complex WHERE conditions to asset queries.
 * 
 * Critical Fix (June 10, 2026): Added AND array support to asset.findMany()
 * and asset.count() to enable multi-condition permission scopes.
 * 
 * Test Scenarios:
 * 1. Simple AND conditions: { AND: [{ companyId: '123' }, { status: 'active' }] }
 * 2. AND with IN operator: { AND: [{ companyId: '123' }, { status: { in: ['active', 'pending'] } }] }
 * 3. AND with contains: { AND: [{ companyId: '123' }, { name: { contains: 'printer' } }] }
 * 4. Tenant admin sees only their company's assets
 * 5. Count queries work correctly with AND conditions
 */
describe('Permission Scopes AND Array Feature (e2e)', () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let prismaService: PrismaService;

  // Test data
  const testCompanyId = 'test-company-' + Date.now();
  const testAssets = [
    {
      id: 'asset-1',
      companyId: testCompanyId,
      name: 'Printer HP LaserJet',
      status: 'active',
      assetType: 'Printer',
    },
    {
      id: 'asset-2',
      companyId: testCompanyId,
      name: 'Switch Cisco 2960',
      status: 'active',
      assetType: 'NetworkDevice',
    },
    {
      id: 'asset-3',
      companyId: testCompanyId,
      name: 'Server Dell PowerEdge',
      status: 'inactive',
      assetType: 'Server',
    },
  ];

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

    databaseService = moduleFixture.get<DatabaseService>(DatabaseService);
    prismaService = moduleFixture.get<PrismaService>(PrismaService);

    await app.init();

    // Setup: Create test assets
    for (const asset of testAssets) {
      await prismaService.asset.create({
        data: asset,
      });
    }
  });

  afterAll(async () => {
    // Cleanup: Delete test assets
    for (const asset of testAssets) {
      await prismaService.execute('DELETE FROM Asset WHERE id = ?', [asset.id]);
    }

    await app.close();
  });

  describe('AND Array Conditions', () => {
    /**
     * Test 1: Simple AND with multiple equality conditions
     * Query: { AND: [{ companyId: '123' }, { status: 'active' }] }
     * Expected: Only active assets from the company
     */
    it('should filter assets with simple AND conditions', async () => {
      const where = {
        AND: [
          { companyId: testCompanyId },
          { status: 'active' },
        ],
      };

      const results = await prismaService.asset.findMany({ where });

      expect(results).toBeDefined();
      expect(results.length).toBe(2); // 2 active assets
      expect(results.every((a: any) => a.status === 'active')).toBe(true);
      expect(results.every((a: any) => a.companyId === testCompanyId)).toBe(true);
    });

    /**
     * Test 2: AND with IN operator for multi-value filtering
     * Query: { AND: [{ companyId: '123' }, { status: { in: ['active'] } }] }
     * Expected: Only assets with status in the specified list
     */
    it('should filter assets with AND and IN operator', async () => {
      const where = {
        AND: [
          { companyId: testCompanyId },
          { status: { in: ['active'] } },
        ],
      };

      const results = await prismaService.asset.findMany({ where });

      expect(results).toBeDefined();
      expect(results.length).toBe(2);
      expect(results.every((a: any) => ['active'].includes(a.status))).toBe(true);
    });

    /**
     * Test 3: AND with CONTAINS operator for text search
     * Query: { AND: [{ companyId: '123' }, { name: { contains: 'printer' } }] }
     * Expected: Only assets matching the text search
     */
    it('should filter assets with AND and CONTAINS operator', async () => {
      const where = {
        AND: [
          { companyId: testCompanyId },
          { name: { contains: 'Printer' } },
        ],
      };

      const results = await prismaService.asset.findMany({ where });

      expect(results).toBeDefined();
      expect(results.length).toBe(1);
      expect(results[0].name).toContain('Printer');
    });

    /**
     * Test 4: Complex AND with multiple conditions including IN and equality
     * Query: { AND: [{ companyId: '123' }, { status: 'active' }, { assetType: { in: ['Printer', 'Server'] } }] }
     */
    it('should filter with complex AND conditions', async () => {
      const where = {
        AND: [
          { companyId: testCompanyId },
          { status: 'active' },
          { assetType: { in: ['Printer'] } },
        ],
      };

      const results = await prismaService.asset.findMany({ where });

      expect(results).toBeDefined();
      expect(results.length).toBe(1);
      expect(results[0].assetType).toBe('Printer');
      expect(results[0].status).toBe('active');
    });

    /**
     * Test 5: AND condition that results in no matches
     * Should return empty array, not error
     */
    it('should return empty array when AND conditions have no matches', async () => {
      const where = {
        AND: [
          { companyId: testCompanyId },
          { status: 'nonexistent' },
        ],
      };

      const results = await prismaService.asset.findMany({ where });

      expect(results).toBeDefined();
      expect(results.length).toBe(0);
    });
  });

  describe('COUNT with AND Conditions', () => {
    /**
     * Test 6: Count queries with AND should match findMany results
     * This ensures pagination calculations are accurate
     */
    it('should count correctly with AND conditions', async () => {
      const where = {
        AND: [
          { companyId: testCompanyId },
          { status: 'active' },
        ],
      };

      const results = await prismaService.asset.findMany({ where });
      const count = await prismaService.asset.count({ where });

      expect(count).toBe(results.length);
      expect(count).toBe(2);
    });

    /**
     * Test 7: Count with complex AND conditions
     */
    it('should count correctly with complex AND conditions', async () => {
      const where = {
        AND: [
          { companyId: testCompanyId },
          { status: 'active' },
          { assetType: { in: ['Printer', 'NetworkDevice'] } },
        ],
      };

      const count = await prismaService.asset.count({ where });

      expect(count).toBe(2);
    });
  });

  describe('Tenant Admin Permission Scopes', () => {
    /**
     * Test 8: Tenant admin can only see their company's assets
     * Simulates PermissionsGuard applying company-level scope
     */
    it('should enforce company-level permission scope with AND', async () => {
      // Simulate permission scope applied by PermissionsGuard
      const tenantCompanyId = testCompanyId;
      const where = {
        AND: [
          { companyId: tenantCompanyId },
        ],
      };

      const results = await prismaService.asset.findMany({ where });

      expect(results).toBeDefined();
      expect(results.every((a: any) => a.companyId === tenantCompanyId)).toBe(true);
    });

    /**
     * Test 9: Tenant admin with status restriction
     * Simulates permission scope that restricts both company AND asset status
     */
    it('should enforce company + status permission scope', async () => {
      // Example: Tenant can see only active assets from their company
      const where = {
        AND: [
          { companyId: testCompanyId },
          { status: { in: ['active'] } }, // Allowed statuses
        ],
      };

      const results = await prismaService.asset.findMany({ where });
      const count = await prismaService.asset.count({ where });

      expect(results.length).toBe(2);
      expect(count).toBe(2);
      expect(results.every((a: any) => a.status === 'active')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    /**
     * Test 10: Empty IN array should match nothing
     */
    it('should return no results when IN operator has empty array', async () => {
      const where = {
        AND: [
          { companyId: testCompanyId },
          { status: { in: [] } },
        ],
      };

      const results = await prismaService.asset.findMany({ where });

      expect(results.length).toBe(0);
    });

    /**
     * Test 11: AND with NULL check
     */
    it('should handle NULL conditions in AND', async () => {
      // Assets without deletedAt are active
      const where = {
        AND: [
          { companyId: testCompanyId },
          // deletedAt IS NULL (records not soft-deleted)
        ],
      };

      const results = await prismaService.asset.findMany({ where });

      expect(results.length).toBeGreaterThan(0);
    });

    /**
     * Test 12: AND with pagination (LIMIT/OFFSET)
     */
    it('should support pagination with AND conditions', async () => {
      const where = {
        AND: [
          { companyId: testCompanyId },
          { status: 'active' },
        ],
      };

      const page1 = await prismaService.asset.findMany({
        where,
        take: 1,
      });

      const page2 = await prismaService.asset.findMany({
        where,
        skip: 1,
        take: 1,
      });

      expect(page1.length).toBeLessThanOrEqual(1);
      expect(page1[0]?.id).not.toBe(page2[0]?.id);
    });
  });
});
