import { IsString, IsOptional, IsEnum } from 'class-validator';

enum AssetType {
  COMPUTER = 'COMPUTER',
  SERVER = 'SERVER',
  PRINTER = 'PRINTER',
  SWITCH = 'SWITCH',
  IP_PHONE = 'IP_PHONE',
  CLOUD_INSTANCE = 'CLOUD_INSTANCE',
  NETWORK_DEVICE = 'NETWORK_DEVICE',
  VIRTUAL_MACHINE = 'VIRTUAL_MACHINE',
  OTHER = 'OTHER',
}

export class CreateAssetDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  assetType?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  macAddress?: string;

  @IsOptional()
  @IsString()
  os?: string;

  @IsOptional()
  @IsString()
  osVersion?: string;

  @IsOptional()
  @IsString()
  cpu?: string;

  @IsOptional()
  @IsString()
  ram?: string;

  @IsOptional()
  @IsString()
  storage?: string;

  @IsOptional()
  @IsString()
  deviceCategory?: string;

  @IsOptional()
  @IsString()
  ownership?: string;

  @IsOptional()
  @IsString()
  assignedUser?: string;

  @IsOptional()
  @IsString()
  enrollmentStatus?: string;

  @IsOptional()
  @IsString()
  managementMode?: string;

  @IsOptional()
  @IsString()
  complianceStatus?: string;

  @IsOptional()
  @IsString()
  policyProfile?: string;

  @IsOptional()
  @IsString()
  mdmProvider?: string;

  @IsOptional()
  @IsString()
  encryptionStatus?: string;

  @IsOptional()
  @IsString()
  antivirusStatus?: string;

  @IsOptional()
  @IsString()
  imei?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  carrier?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
