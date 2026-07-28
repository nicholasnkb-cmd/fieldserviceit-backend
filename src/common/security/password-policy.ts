import { BadRequestException } from '@nestjs/common';

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

const BLOCKED_PASSWORDS = new Set([
  '123456789012345',
  'adminadminadmin',
  'changemechangeme',
  'fieldserviceit',
  'letmeinletmein',
  'passwordpassword',
  'qwertyqwertyqwerty',
  'welcome123456789',
]);

export function passwordPolicyError(password: unknown, contextValues: string[] = []): string | null {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Password must be no more than ${PASSWORD_MAX_LENGTH} characters`;

  const normalized = password.normalize('NFKC').toLowerCase();
  if (BLOCKED_PASSWORDS.has(normalized)) return 'Choose a password that is not commonly used or associated with this service';

  const context = contextValues
    .flatMap((value) => String(value || '').toLowerCase().split(/[^a-z0-9]+/))
    .filter((value) => value.length >= 4);
  if (context.some((value) => normalized.includes(value))) {
    return 'Password must not contain your email address, name, or organization name';
  }

  return null;
}

export function assertPasswordPolicy(password: unknown, contextValues: string[] = []): void {
  const error = passwordPolicyError(password, contextValues);
  if (error) throw new BadRequestException(error);
}
