CREATE TABLE IF NOT EXISTS SloMeasurement (
  id VARCHAR(191) PRIMARY KEY,
  serviceName VARCHAR(64) NOT NULL,
  healthy TINYINT(1) NOT NULL,
  latencyMs INT,
  errorRate DECIMAL(8,4),
  releaseCommit VARCHAR(191),
  measuredAt DATETIME(3) NOT NULL,
  INDEX SloMeasurement_service_time_idx (serviceName, measuredAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
