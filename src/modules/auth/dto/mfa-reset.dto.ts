import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMfaResetRequestDto {
  @IsEmail()
  @MaxLength(191)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ReviewMfaResetRequestDto {
  @IsIn(['APPROVED', 'DENIED'])
  status: 'APPROVED' | 'DENIED';

  @IsString()
  @MaxLength(2000)
  reviewNotes: string;
}
