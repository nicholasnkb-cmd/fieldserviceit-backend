import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class TrackTicketDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  ticketNumber: string;
}
