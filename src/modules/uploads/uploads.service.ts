import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { getS3Client, getS3Bucket } from '../../config/s3.config';
import { MalwareScannerService } from './malware-scanner.service';

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
  '.doc': [new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])],
  '.xls': [new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])],
  '.docx': [new Uint8Array([0x50, 0x4B, 0x03, 0x04])],
  '.xlsx': [new Uint8Array([0x50, 0x4B, 0x03, 0x04])],
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
  private readonly uploadDir: string;
  private readonly storageType: string;
  private s3Client: S3Client | null = null;
  private s3Bucket: string = '';

  constructor(
    private config: ConfigService,
    private readonly malwareScanner: MalwareScannerService,
  ) {
    this.uploadDir = this.config.get('UPLOAD_DIR', path.join(process.cwd(), 'uploads'));
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
    await this.malwareScanner.scan(file);
    const filename = `${crypto.randomUUID()}${ext}`;

    if (this.storageType === 's3' && this.s3Client) {
      return this.saveToS3(file, subfolder, filename);
    }
    return this.saveToLocal(file, subfolder, filename);
  }

  async saveFiles(files: Express.Multer.File[], subfolder: string): Promise<string[]> {
    return Promise.all(files.map((f) => this.saveFile(f, subfolder)));
  }

  async saveProtectedFiles(files: Express.Multer.File[], subfolder: string, companyId: string | null): Promise<string[]> {
    return Promise.all(files.map((file) => this.saveProtectedFile(file, subfolder, companyId)));
  }

  async readProtectedFile(token: string, user: any) {
    const payload = this.verifyProtectedToken(token);
    if (user.role !== 'SUPER_ADMIN' && payload.companyId !== user.companyId) {
      throw new BadRequestException('Protected file is outside your tenant');
    }
    if (this.storageType === 's3' && this.s3Client) {
      const result: any = await this.s3Client.send(new GetObjectCommand({ Bucket: this.s3Bucket, Key: payload.key }));
      const bytes = result.Body?.transformToByteArray ? await result.Body.transformToByteArray() : [];
      return { buffer: Buffer.from(bytes), mimeType: payload.mimeType, fileName: payload.fileName };
    }
    const protectedRoot = path.resolve(path.dirname(this.uploadDir), 'protected_uploads');
    const fullPath = path.resolve(protectedRoot, payload.key);
    if (!fullPath.startsWith(`${protectedRoot}${path.sep}`)) throw new BadRequestException('Invalid protected file path');
    return { buffer: await fs.promises.readFile(fullPath), mimeType: payload.mimeType, fileName: payload.fileName };
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

  private async saveProtectedFile(file: Express.Multer.File, subfolder: string, companyId: string | null) {
    if (!file) throw new BadRequestException('No file provided');
    const sanitized = sanitizeFilename(file.originalname);
    validateExtension(sanitized);
    const ext = path.extname(sanitized) || '.bin';
    validateMagicBytes(file.buffer, ext);
    scanForKnownMalwareMarkers(file.buffer);
    await this.malwareScanner.scan(file);
    const key = `${subfolder}/${crypto.randomUUID()}${ext}`.replace(/\\/g, '/');
    if (this.storageType === 's3' && this.s3Client) {
      await this.s3Client.send(new PutObjectCommand({ Bucket: this.s3Bucket, Key: key, Body: file.buffer, ContentType: file.mimetype }));
    } else {
      const protectedRoot = path.resolve(path.dirname(this.uploadDir), 'protected_uploads');
      const target = path.resolve(protectedRoot, key);
      if (!target.startsWith(`${protectedRoot}${path.sep}`)) throw new BadRequestException('Invalid protected file path');
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, file.buffer);
    }
    const token = this.signProtectedToken({
      key,
      companyId,
      mimeType: file.mimetype,
      fileName: sanitized,
      exp: Date.now() + 365 * 24 * 60 * 60 * 1000,
    });
    return `/v1/uploads/protected/${token}`;
  }

  private signProtectedToken(payload: any) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.protectedSignature(encoded);
    return `${encoded}.${signature}`;
  }

  private verifyProtectedToken(token: string) {
    const [encoded, signature] = String(token || '').split('.');
    const expected = this.protectedSignature(encoded || '');
    if (!signature || signature.length !== expected.length || !cryptoSafeEqual(signature, expected)) {
      throw new BadRequestException('Protected file link is invalid');
    }
    let payload: any;
    try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { throw new BadRequestException('Protected file link is invalid'); }
    if (!payload?.key || Number(payload.exp || 0) <= Date.now()) throw new BadRequestException('Protected file link expired');
    return payload;
  }

  private protectedSignature(value: string) {
    const secret = this.config.get('JWT_SECRET', 'fieldserviceit-dev-key');
    return crypto.createHmac('sha256', secret).update(value).digest('base64url');
  }
}

function cryptoSafeEqual(left: string, right: string) {
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
