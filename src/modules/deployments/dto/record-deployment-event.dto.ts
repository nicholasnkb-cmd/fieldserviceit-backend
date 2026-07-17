import { IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';

export const DEPLOYMENT_COMPONENTS = ['backend', 'frontend', 'release', 'migration', 'rollback', 'health'] as const;
export const DEPLOYMENT_STATUSES = ['STARTED', 'SUCCEEDED', 'FAILED', 'ROLLED_BACK', 'UNHEALTHY'] as const;

export class RecordDeploymentEventDto {
  @IsString()
  @MaxLength(64)
  releaseCommit: string;

  @IsIn(DEPLOYMENT_COMPONENTS)
  component: typeof DEPLOYMENT_COMPONENTS[number];

  @IsIn(DEPLOYMENT_STATUSES)
  status: typeof DEPLOYMENT_STATUSES[number];

  @IsString()
  @IsOptional()
  @MaxLength(64)
  source?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  workflowRunId?: string;

  @IsUrl({ require_protocol: true })
  @IsOptional()
  @MaxLength(500)
  workflowUrl?: string;

  @IsInt()
  @Min(0)
  @Max(86_400_000)
  @IsOptional()
  durationMs?: number;

  @IsObject()
  @IsOptional()
  detail?: Record<string, unknown>;

  @IsDateString()
  @IsOptional()
  startedAt?: string;

  @IsDateString()
  @IsOptional()
  completedAt?: string;
}
