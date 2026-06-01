import { IsOptional, IsObject } from 'class-validator';

export class UpdateFeatureOverridesDto {
  @IsOptional()
  @IsObject()
  featureOverrides?: Record<string, boolean>;

  @IsOptional()
  @IsObject()
  restrictions?: Record<string, any>;
}
