import { IsOptional, IsObject } from 'class-validator';

export class UpdateUserFeatureControlsDto {
  @IsOptional()
  @IsObject()
  featureOverrides?: Record<string, boolean>;
}
