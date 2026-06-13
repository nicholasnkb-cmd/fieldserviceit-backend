import { CmdbService } from './cmdb.service';

describe('CmdbService network utilities', () => {
  const service = new CmdbService({} as any, {} as any, {} as any, {} as any, {} as any) as any;

  it('encrypts and decrypts secrets', () => {
    const encrypted = service.encryptSecret('super-secret');

    expect(encrypted).toMatch(/^ENC:/);
    expect(service.decryptSecret(encrypted)).toBe('super-secret');
  });

  it('builds line diffs for config backups', () => {
    const diff = service.lineDiff('hostname old\ninterface 1', 'hostname new\ninterface 1');

    expect(diff).toEqual([
      { type: 'removed', line: 'hostname old' },
      { type: 'added', line: 'hostname new' },
      { type: 'same', line: 'interface 1' },
    ]);
  });
});
