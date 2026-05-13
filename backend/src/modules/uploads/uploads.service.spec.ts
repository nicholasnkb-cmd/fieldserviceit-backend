import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UploadsService } from './uploads.service';

jest.mock('uuid', () => ({ v4: () => 'mocked-uuid' }));
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: jest.fn(),
}));

describe('UploadsService', () => {
  let service: UploadsService;

  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer: Buffer.from('fake-image-data'),
    size: 14,
    destination: '',
    filename: '',
    path: '',
    stream: null as any,
  };

  describe('local storage mode', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadsService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue('local') },
          },
        ],
      }).compile();

      service = module.get<UploadsService>(UploadsService);
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
  });

  describe('s3 storage mode', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadsService,
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
