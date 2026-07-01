import { IsString, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';

enum RequestType {
  HARDWARE = 'HARDWARE',
  SOFTWARE = 'SOFTWARE',
  SERVICE = 'SERVICE',
  ACCESS = 'ACCESS',
  OTHER = 'OTHER',
}

enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export class CreateCatalogRequestDto {
  @IsOptional()
  @IsString()
  catalogItemId?: string;

  @IsEnum(RequestType)
  @IsOptional()
  requestType?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  itemName?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  justification?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: string;
}
