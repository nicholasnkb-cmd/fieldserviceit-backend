import { IsOptional, IsString, IsBoolean, IsIn, MaxLength, ValidateIf } from 'class-validator';

const VALID_ROLES = ['SUPER_ADMIN', 'GLOBAL_TECH', 'TENANT_ADMIN', 'TECHNICIAN', 'CLIENT', 'READ_ONLY'];
const VALID_USER_TYPES = ['PUBLIC', 'BUSINESS'];

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsString()
  @IsIn(VALID_ROLES)
  role?: string;

  @IsOptional()
  @IsString()
  @IsIn(VALID_USER_TYPES)
  userType?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  companyId?: string | null;
}
