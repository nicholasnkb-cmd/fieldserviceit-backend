import { SetMetadata } from '@nestjs/common';
import { CHECK_TICKET_LIMIT, CHECK_USER_LIMIT } from '../guards/feature.guard';

export const CheckTicketLimit = () => SetMetadata(CHECK_TICKET_LIMIT, true);
export const CheckUserLimit = () => SetMetadata(CHECK_USER_LIMIT, true);
