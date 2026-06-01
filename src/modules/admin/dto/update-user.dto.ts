import { IsOptional, IsString, IsBoolean, IsIn } from 'class-validator';

const VALID_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'TECHNICIAN', 'CLIENT', 'READ_ONLY'];

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  @IsIn(VALID_ROLES)
  role?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  companyId?: string;
}
