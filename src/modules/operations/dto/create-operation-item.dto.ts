import { IsIn, IsISO8601, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

const MODULE_KEYS = [
  'customer-portal',
  'technician-mobile',
  'inventory',
  'quotes-invoices',
  'sla',
  'maintenance',
  'knowledge-base',
  'alerting',
  'topology',
  'security-center',
] as const;

const STATUSES = ['ACTIVE', 'PLANNED', 'REVIEW', 'DONE', 'BLOCKED'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type OperationModuleKey = (typeof MODULE_KEYS)[number];

export class CreateOperationItemDto {
  @IsIn(MODULE_KEYS)
  moduleKey: OperationModuleKey;

  @IsString()
  @MaxLength(191)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  ticketId?: string;

  @IsOptional()
  @IsString()
  assetId?: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export { MODULE_KEYS, STATUSES, PRIORITIES };
