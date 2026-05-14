import { ConfigService } from '@nestjs/config';
export declare class UploadsService {
    private config;
    private readonly logger;
    private readonly uploadDir;
    private readonly storageType;
    private s3Client;
    private s3Bucket;
    constructor(config: ConfigService);
    saveFile(file: Express.Multer.File, subfolder: string): Promise<string>;
    saveFiles(files: Express.Multer.File[], subfolder: string): Promise<string[]>;
    private saveToLocal;
    private saveToS3;
}
