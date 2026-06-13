import { execFileSync } from 'child_process';
import * as path from 'path';

describe('authorization coverage', () => {
  it('does not introduce authenticated routes without permission enforcement', () => {
    expect(() => execFileSync(
      process.execPath,
      [path.resolve(process.cwd(), 'scripts', 'check-permission-coverage.js')],
      { stdio: 'pipe' },
    )).not.toThrow();
  });
});
