import { IsString } from 'class-validator';

export class RotateNetworkCredentialDto {
  @IsString()
  secret: string;
}
