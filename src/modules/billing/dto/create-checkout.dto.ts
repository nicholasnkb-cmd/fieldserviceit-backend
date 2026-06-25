import { Equals, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../auth/legal-consent';

export class CreateCheckoutDto {
  @IsString()
  planId: string;

  @IsOptional()
  @IsIn(['MONTH', 'YEAR'])
  interval?: 'MONTH' | 'YEAR';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  seats?: number;

  @IsOptional()
  @IsBoolean()
  useTrial?: boolean;

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  successUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  cancelUrl?: string;

  @Equals(true, { message: 'You must accept the Terms of Service before checkout' })
  termsAccepted: boolean;

  @IsIn([TERMS_VERSION], { message: 'Review the current Terms of Service before checkout' })
  termsVersion: string;

  @IsIn([PRIVACY_VERSION], { message: 'Review the current Privacy Policy before checkout' })
  privacyVersion: string;
}
