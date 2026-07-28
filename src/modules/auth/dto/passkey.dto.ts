import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PasskeyVerificationDto {
  @IsString()
  @MinLength(10)
  @MaxLength(191)
  challengeId: string;

  @IsObject()
  response: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class RenamePasskeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}

export class RecoveryCodesDto {
  @IsString()
  @MaxLength(128)
  password: string;

  @IsString()
  @MaxLength(32)
  code: string;
}
