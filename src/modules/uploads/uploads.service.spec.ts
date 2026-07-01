import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sharp = require('sharp');
import { UploadsService } from './uploads.service';
import { MalwareScannerService } from './malware-scanner.service';

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: () => 'mocked-uuid',
}));
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: jest.fn(),
}));

describe('UploadsService', () => {
  let service: UploadsService;
  let uploadDir: string;

  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]),
    size: 14,
    destination: '',
    filename: '',
    path: '',
    stream: null as any,
  };

  describe('local storage mode', () => {
    beforeEach(async () => {
      uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsit-uploads-'));
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadsService,
          { provide: MalwareScannerService, useValue: { scan: jest.fn().mockResolvedValue({ status: 'PASS' }) } },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: any) => {
                if (key === 'STORAGE_TYPE') return 'local';
                if (key === 'UPLOAD_DIR') return uploadDir;
                return defaultValue;
              }),
            },
          },
        ],
      }).compile();

      service = module.get<UploadsService>(UploadsService);
    });

    afterEach(() => {
      if (uploadDir) fs.rmSync(uploadDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should throw on missing file', async () => {
      await expect(service.saveFile(null as any, 'test')).rejects.toThrow('No file provided');
    });

    it('should return a local URL path', async () => {
      const result = await service.saveFile(mockFile, 'avatars');
      expect(result).toMatch(/^\/uploads\/avatars\/.+\.jpg$/);
    });

    it('should save multiple files', async () => {
      const results = await service.saveFiles([mockFile, mockFile], 'photos/test');
      expect(results).toHaveLength(2);
      results.forEach((r) => expect(r).toMatch(/^\/uploads\/photos\/test\/.+\.jpg$/));
    });

    it('should automatically format company logos as bounded WebP images', async () => {
      const logoBuffer = await sharp({
        create: {
          width: 1200,
          height: 300,
          channels: 4,
          background: { r: 37, g: 99, b: 235, alpha: 1 },
        },
      }).png().toBuffer();
      const logo = {
        ...mockFile,
        originalname: 'large-logo.png',
        mimetype: 'image/png',
        buffer: logoBuffer,
        size: logoBuffer.length,
      };

      const result = await service.saveBrandingImage(logo, 'branding/company-1', 'logoUrl');
      const savedPath = path.join(uploadDir, result.replace('/uploads/', ''));
      const metadata = await sharp(fs.readFileSync(savedPath)).metadata();

      expect(result).toBe('/uploads/branding/company-1/mocked-uuid.webp');
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBeLessThanOrEqual(512);
      expect(metadata.height).toBeLessThanOrEqual(160);
    });
  });

  describe('s3 storage mode', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadsService,
          { provide: MalwareScannerService, useValue: { scan: jest.fn().mockResolvedValue({ status: 'PASS' }) } },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'STORAGE_TYPE') return 's3';
                if (key === 'S3_ENDPOINT') return 'http://localhost:9000';
                if (key === 'S3_REGION') return 'us-east-1';
                if (key === 'S3_BUCKET') return 'test-bucket';
                if (key === 'S3_ACCESS_KEY_ID') return 'test-key';
                if (key === 'S3_SECRET_ACCESS_KEY') return 'test-secret';
                return null;
              }),
            },
          },
        ],
      }).compile();

      service = module.get<UploadsService>(UploadsService);
    });

    it('should return a URL path for s3', async () => {
      const result = await service.saveFile(mockFile, 'avatars');
      expect(result).toMatch(/^\/uploads\/avatars\/.+\.jpg$/);
    });
  });
});
