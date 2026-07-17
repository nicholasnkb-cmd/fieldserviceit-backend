import { BadRequestException } from '@nestjs/common';
import { createPool } from 'mysql2/promise';
import { DatabaseService } from './database.service';

jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => ({
    query: jest.fn(),
    execute: jest.fn(),
    getConnection: jest.fn(),
    end: jest.fn(),
  })),
}));

describe('DatabaseService SQL identifiers', () => {
  let service: DatabaseService;

  beforeEach(() => {
    process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/fieldserviceit_test';
    jest.clearAllMocks();
    service = new DatabaseService();
  });

  it('quotes generic table and select identifiers through the shared validator', async () => {
    const query = jest.spyOn(service, 'query').mockResolvedValue([{ id: 'row-1' }] as any);

    await (service as any).genericFindFirst('CatalogRequest', {
      where: { id: 'row-1' },
      select: { id: true, status: true },
    });

    expect(query).toHaveBeenCalledWith(
      'SELECT `id`, `status` FROM `CatalogRequest` WHERE `id` = ? LIMIT 1',
      ['row-1'],
    );
  });

  it.each([
    'CatalogRequest; DROP TABLE User',
    'CatalogRequest WHERE 1=1 --',
    'CatalogRequest`',
  ])('rejects unsafe generic table identifier %p', async (table) => {
    await expect((service as any).genericCount(table, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    'id` FROM User --',
    'status; DROP TABLE User',
    'company.id',
  ])('rejects unsafe generic select identifier %p', async (column) => {
    await expect((service as any).genericFindFirst('CatalogRequest', {
      where: { id: 'row-1' },
      select: { [column]: true },
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps RolePermission createMany on the shared validator', async () => {
    jest.spyOn(service, 'query').mockResolvedValue([] as any);

    await expect(service.rolePermission.createMany({
      data: [{ roleId: 'role-1', 'permissionId` = permissionId --': 'perm-1' }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('initializes a pool without touching the network during identifier tests', () => {
    expect(createPool).toHaveBeenCalled();
  });
});
