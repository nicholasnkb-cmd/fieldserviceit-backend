import { Equals, IsEmail, IsIn, IsNotEmpty, IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';
import { PRIVACY_VERSION, TERMS_VERSION } from '../legal-consent';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, { message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' })
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName: string;

  @IsString()
  @IsOptional()
  @MaxLength(24)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(160)
  location?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  preferredContactMethod?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  timezone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  planName?: string;

  @Equals(true, { message: 'You must accept the Terms of Service and acknowledge the Privacy Policy' })
  termsAccepted: boolean;

  @IsIn([TERMS_VERSION], { message: 'The Terms of Service have changed; review and accept the current version' })
  termsVersion: string;

  @IsIn([PRIVACY_VERSION], { message: 'The Privacy Policy has changed; review the current version' })
  privacyVersion: string;
}
