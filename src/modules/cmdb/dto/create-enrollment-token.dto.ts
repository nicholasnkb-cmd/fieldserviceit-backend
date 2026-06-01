import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';

export class CreateEnrollmentTokenDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(168)
  ttlHours?: number;

  @IsOptional()
  @IsString()
  deviceCategory?: string;

  @IsOptional()
  @IsString()
  ownership?: string;

  @IsOptional()
  @IsString()
  policyProfile?: string;
}
