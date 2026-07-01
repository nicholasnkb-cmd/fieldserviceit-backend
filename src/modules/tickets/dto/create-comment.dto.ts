import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateCommentDto {
  @IsNotEmpty()
  @IsString()
  comment: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}