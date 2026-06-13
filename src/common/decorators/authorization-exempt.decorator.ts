import { SetMetadata } from '@nestjs/common';

export const AUTHORIZATION_EXEMPT_KEY = 'authorizationExempt';
export interface AuthorizationExemption {
  reason: string;
  owner: string;
  reviewBy: string;
}

export const AuthorizationExempt = (reason: string, owner: string, reviewBy: string) =>
  SetMetadata(AUTHORIZATION_EXEMPT_KEY, { reason, owner, reviewBy } satisfies AuthorizationExemption);
