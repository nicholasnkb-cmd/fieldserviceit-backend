import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const PRIVACY_REQUEST_TYPES = ['ACCESS', 'CORRECTION', 'DELETION', 'EXPORT', 'OPT_OUT', 'APPEAL'] as const;
export const PRIVACY_REQUEST_STATUSES = ['RECEIVED', 'VERIFYING', 'IN_REVIEW', 'COMPLETED', 'DENIED', 'CANCELED'] as const;

export class CreatePrivacyRequestDto {
  @IsEmail()
  @MaxLength(191)
  email: string;

  @IsIn(PRIVACY_REQUEST_TYPES)
  requestType: typeof PRIVACY_REQUEST_TYPES[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  jurisdiction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;
}

export class UpdatePrivacyRequestDto {
  @IsIn(PRIVACY_REQUEST_STATUSES)
  status: typeof PRIVACY_REQUEST_STATUSES[number];

  @IsOptional()
  @IsBoolean()
  identityVerified?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  resolutionNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  assignedToId?: string;

  @IsOptional()
  @IsBoolean()
  legalHold?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  legalHoldReason?: string;

  @IsOptional()
  @IsBoolean()
  deletionApproved?: boolean;
}

export class PrivacyTokenDto {
  @IsString()
  @MaxLength(512)
  token: string;
}
