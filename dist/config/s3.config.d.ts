import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
export declare function getS3Client(config: ConfigService): S3Client | null;
export declare function getS3Bucket(config: ConfigService): string;
