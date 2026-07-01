import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  @IsString()
  @IsOptional()
  refreshToken?: string;
}
