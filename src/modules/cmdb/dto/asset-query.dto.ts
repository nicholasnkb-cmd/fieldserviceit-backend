import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AssetQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  deviceCategory?: string;

  @IsOptional()
  @IsString()
  assetType?: string;

  @IsOptional()
  @IsString()
  enrollmentStatus?: string;

  @IsOptional()
  @IsString()
  complianceStatus?: string;

  @IsOptional()
  @IsString()
  ownership?: string;
}
