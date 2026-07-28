import { assertPasswordPolicy, passwordPolicyError } from './password-policy';

describe('password policy', () => {
  it('accepts long passphrases without composition requirements', () => {
    expect(passwordPolicyError('correct horse battery staple')).toBeNull();
  });

  it('rejects short and common passwords', () => {
    expect(passwordPolicyError('Short pass1')).toContain('at least 15');
    expect(passwordPolicyError('passwordpassword')).toContain('commonly used');
  });

  it('rejects account context and throws a safe validation error', () => {
    expect(() => assertPasswordPolicy('nicholas-secure-passphrase', ['nicholas@example.com'])).toThrow(
      'must not contain',
    );
  });
});
