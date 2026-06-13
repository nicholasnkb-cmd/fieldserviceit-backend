import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  planId: string;

  @IsOptional()
  @IsIn(['STRIPE', 'PADDLE', 'LEMON_SQUEEZY', 'CHARGEBEE'])
  provider?: string;

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
}
