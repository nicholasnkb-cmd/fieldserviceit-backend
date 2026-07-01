import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

let s3Client: S3Client | null = null;

export function getS3Client(config: ConfigService): S3Client | null {
  const type = config.get('STORAGE_TYPE', 'local');
  if (type !== 's3') return null;

  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: config.get('S3_ENDPOINT'),
      region: config.get('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID')!,
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY')!,
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

export function getS3Bucket(config: ConfigService): string {
  return config.get('S3_BUCKET', 'fieldserviceit-uploads');
}
