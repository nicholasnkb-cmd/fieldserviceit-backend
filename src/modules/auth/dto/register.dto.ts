import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, { message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' })
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName: string;

  @IsString()
  @IsOptional()
  @MaxLength(24)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(160)
  location?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  preferredContactMethod?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  timezone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  planName?: string;
}
