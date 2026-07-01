export interface CurrentUser {
  id: string;
  email: string;
  role: string;
  userType: string;
  companyId: string | null;
  effectiveCompanyId?: string | null;
  isImpersonatingCompany?: boolean;
  isImpersonatingUser?: boolean;
  impersonationSessionId?: string;
  impersonationActorId?: string;
  impersonationActorEmail?: string;
  sessionId?: string;
  isActive: boolean;
  authVersion?: number;
  department?: string | null;
  location?: string | null;
  permissionScopes?: any[];
  permissionSlugs?: string[];
  superAdminOverride?: boolean;
}
