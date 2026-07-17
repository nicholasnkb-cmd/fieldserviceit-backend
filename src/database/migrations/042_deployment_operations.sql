CREATE TABLE IF NOT EXISTS DeploymentEvent (
  id VARCHAR(191) PRIMARY KEY,
  releaseCommit VARCHAR(64) NOT NULL,
  component VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'github-actions',
  workflowRunId VARCHAR(64),
  workflowUrl VARCHAR(500),
  durationMs BIGINT,
  detail TEXT,
  startedAt DATETIME(3),
  completedAt DATETIME(3),
  createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY DeploymentEvent_release_component_run_key (releaseCommit, component, workflowRunId),
  INDEX DeploymentEvent_createdAt_idx (createdAt),
  INDEX DeploymentEvent_status_createdAt_idx (status, createdAt),
  INDEX DeploymentEvent_releaseCommit_idx (releaseCommit)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
