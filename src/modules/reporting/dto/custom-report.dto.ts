import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const CUSTOM_REPORT_FIELDS = [
  'ticketNumber',
  'title',
  'status',
  'priority',
  'type',
  'category',
  'location',
  'createdAt',
  'resolvedAt',
  'assignedTo',
  'resolutionDurationMinutes',
] as const;

const TICKET_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELLED'];
const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export class CustomReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CUSTOM_REPORT_FIELDS.length)
  @IsIn(CUSTOM_REPORT_FIELDS, { each: true })
  fields: string[];

  @IsOptional()
  @IsArray()
  @IsIn(TICKET_STATUSES, { each: true })
  statuses?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(TICKET_PRIORITIES, { each: true })
  priorities?: string[];

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
