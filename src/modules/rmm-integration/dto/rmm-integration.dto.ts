import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class RmmProviderDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9-]+$/)
  provider!: string;
}

export class SyncRmmAssetDto extends RmmProviderDto {
  @IsObject()
  assetData!: Record<string, unknown>;
}

export class CreateRmmAlertDto extends RmmProviderDto {
  @IsObject()
  alert!: Record<string, unknown>;
}

export class TestRmmConfigDto extends RmmProviderDto {
  @IsObject()
  credentials!: Record<string, unknown>;
}

export class SaveRmmConfigDto extends TestRmmConfigDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(10080)
  syncIntervalMin?: number;
}
