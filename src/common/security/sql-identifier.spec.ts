import { escapeSqlIdentifier } from './sql-identifier';

describe('escapeSqlIdentifier', () => {
  it('quotes valid identifiers', () => {
    expect(escapeSqlIdentifier('companyId')).toBe('`companyId`');
    expect(escapeSqlIdentifier('_count2')).toBe('`_count2`');
  });

  it.each(['name` FROM User --', 'name; DROP TABLE User', 'table.column', '', 'two words'])
    ('rejects unsafe identifier %p', (identifier) => {
      expect(() => escapeSqlIdentifier(identifier)).toThrow('Invalid SQL identifier');
    });
});
