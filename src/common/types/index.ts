export interface CurrentUser {
  id: string;
  email: string;
  role: string;
  userType: string;
  companyId: string | null;
  effectiveCompanyId?: string | null;
  isImpersonatingCompany?: boolean;
  isActive: boolean;
}
