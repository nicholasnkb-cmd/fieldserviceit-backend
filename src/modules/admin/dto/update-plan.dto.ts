import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  monthlyPrice?: number;

  @IsOptional()
  @IsNumber()
  maxUsers?: number;

  @IsOptional()
  @IsNumber()
  maxTickets?: number;

  @IsOptional()
  @IsString()
  stripePriceId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
