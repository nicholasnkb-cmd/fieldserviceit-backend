import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { getS3Client, getS3Bucket } from '../../config/s3.config';

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.pdf', '.txt', '.doc', '.docx',
  '.csv', '.xlsx', '.xls',
]);

function sanitizeFilename(originalname: string): string {
  const base = path.basename(originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || 'unnamed';
}

function validateExtension(filename: string): void {
  const ext = path.extname(filename).toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    throw new BadRequestException(`File extension "${ext || 'none'}" not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`);
  }
}

const MAGIC_BYTES: Record<string, Uint8Array[]> = {
  '.jpg': [new Uint8Array([0xFF, 0xD8, 0xFF])],
  '.jpeg': [new Uint8Array([0xFF, 0xD8, 0xFF])],
  '.png': [new Uint8Array([0x89, 0x50, 0x4E, 0x47])],
  '.gif': [new Uint8Array([0x47, 0x49, 0x46])],
  '.webp': [new Uint8Array([0x52, 0x49, 0x46, 0x46])],
  '.pdf': [new Uint8Array([0x25, 0x50, 0x44, 0x46])],
};

function validateMagicBytes(buffer: Buffer, ext: string): void {
  const signatures = MAGIC_BYTES[ext];
  if (!signatures) return;
  const match = signatures.some(sig =>
    sig.every((byte, i) => buffer[i] === byte)
  );
  if (!match) {
    throw new BadRequestException('File content does not match its extension');
  }
}

function scanForKnownMalwareMarkers(buffer: Buffer): void {
  const prefix = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8');
  if (prefix.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) {
    throw new BadRequestException('File failed malware scan');
  }
  if (/<script[\s>]/i.test(prefix)) {
    throw new BadRequestException('Executable script content is not allowed in uploads');
  }
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads');
  private readonly storageType: string;
  private s3Client: S3Client | null = null;
  private s3Bucket: string = '';

  constructor(private config: ConfigService) {
    this.storageType = this.config.get('STORAGE_TYPE', 'local');
    if (this.storageType === 's3') {
      this.s3Client = getS3Client(this.config);
      this.s3Bucket = getS3Bucket(this.config);
    }
  }

  async saveFile(file: Express.Multer.File, subfolder: string): Promise<string> {
    if (!file) throw new BadRequestException('No file provided');

    const sanitized = sanitizeFilename(file.originalname);
    validateExtension(sanitized);
    const ext = path.extname(sanitized) || '.bin';
    validateMagicBytes(file.buffer, ext);
    scanForKnownMalwareMarkers(file.buffer);
    const filename = `${randomUUID()}${ext}`;

    if (this.storageType === 's3' && this.s3Client) {
      return this.saveToS3(file, subfolder, filename);
    }
    return this.saveToLocal(file, subfolder, filename);
  }

  async saveFiles(files: Express.Multer.File[], subfolder: string): Promise<string[]> {
    return Promise.all(files.map((f) => this.saveFile(f, subfolder)));
  }

  private async saveToLocal(file: Express.Multer.File, subfolder: string, filename: string): Promise<string> {
    const dir = path.join(this.uploadDir, subfolder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, filename), file.buffer);
    return `/uploads/${subfolder}/${filename}`;
  }

  private async saveToS3(file: Express.Multer.File, subfolder: string, filename: string): Promise<string> {
    const key = `${subfolder}/${filename}`;
    await this.s3Client!.send(
      new PutObjectCommand({
        Bucket: this.s3Bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    return `/uploads/${key}`;
  }
}
