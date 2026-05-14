import { CreateTicketDto } from './create-ticket.dto';
declare const UpdateTicketDto_base: import("@nestjs/common").Type<Partial<CreateTicketDto>>;
export declare class UpdateTicketDto extends UpdateTicketDto_base {
    status?: string;
    assignedToId?: string;
    onHoldReason?: string;
    resolution?: string;
}
export {};
