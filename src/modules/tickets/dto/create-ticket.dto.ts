import { IsString, IsNotEmpty, IsOptional, IsEnum, IsUUID, IsNumber, IsEmail, MaxLength } from 'class-validator';

enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

enum TicketType {
  INCIDENT = 'INCIDENT',
  REQUEST = 'REQUEST',
  PROBLEM = 'PROBLEM',
  CHANGE = 'CHANGE',
}

export class CreateTicketDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(191)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(160)
  contactName: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(191)
  contactEmail: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(24)
  contactPhone: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subcategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsEnum(TicketType)
  type?: TicketType;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  slaId?: string;
}
