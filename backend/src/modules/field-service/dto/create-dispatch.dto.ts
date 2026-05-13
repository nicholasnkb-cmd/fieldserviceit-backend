import { IsString, IsUUID } from 'class-validator';

export class CreateDispatchDto {
  @IsUUID()
  ticketId: string;

  @IsUUID()
  technicianId: string;
}
