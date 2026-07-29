export const TERMS_VERSION = '2026-07-29';
export const PRIVACY_VERSION = '2026-07-29';

export type LegalConsentInput = {
  termsAccepted: boolean;
  termsVersion: string;
  privacyVersion: string;
};
