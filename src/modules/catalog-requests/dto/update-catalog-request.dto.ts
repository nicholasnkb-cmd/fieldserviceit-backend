import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsNumber, Min } from 'class-validator';
import { CreateCatalogRequestDto } from './create-catalog-request.dto';

enum Status {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
}

export class UpdateCatalogRequestDto extends PartialType(CreateCatalogRequestDto) {
  @IsOptional()
  @IsEnum(Status)
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
