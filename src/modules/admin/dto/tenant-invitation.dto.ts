import { Equals, IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../../common/security/password-policy';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../auth/legal-consent';

export const TENANT_INVITATION_ROLES = ['CLIENT', 'TECHNICIAN', 'READ_ONLY'] as const;

export class CreateTenantInvitationDto {
  @IsEmail()
  @MaxLength(191)
  email: string;

  @IsIn(TENANT_INVITATION_ROLES)
  role: typeof TENANT_INVITATION_ROLES[number];
}

export class AcceptTenantInvitationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;

  @Equals(true, { message: 'You must accept the Terms of Service and acknowledge the Privacy Policy' })
  termsAccepted: boolean;

  @IsIn([TERMS_VERSION])
  termsVersion: string;

  @IsIn([PRIVACY_VERSION])
  privacyVersion: string;
}
