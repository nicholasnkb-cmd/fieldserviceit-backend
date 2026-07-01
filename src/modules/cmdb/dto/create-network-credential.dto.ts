import { IsOptional, IsString, IsObject } from 'class-validator';

export class CreateNetworkCredentialDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  assetId?: string;

  @IsOptional()
  @IsString()
  vendor?: string;

  @IsOptional()
  @IsString()
  authMode?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
