export const TERMS_VERSION = '2026-06-21';
export const PRIVACY_VERSION = '2026-06-21';

export type LegalConsentInput = {
  termsAccepted: boolean;
  termsVersion: string;
  privacyVersion: string;
};
