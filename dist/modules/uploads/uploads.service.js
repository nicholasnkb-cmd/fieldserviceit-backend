"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var UploadsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_s3_1 = require("@aws-sdk/client-s3");
const path = require("path");
const fs = require("fs");
const uuid_1 = require("uuid");
const s3_config_1 = require("../../config/s3.config");
const ALLOWED_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.pdf', '.txt', '.doc', '.docx',
    '.csv', '.xlsx', '.xls',
]);
function sanitizeFilename(originalname) {
    const base = path.basename(originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    return base || 'unnamed';
}
function validateExtension(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
        throw new common_1.BadRequestException(`File extension "${ext || 'none'}" not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`);
    }
}
let UploadsService = UploadsService_1 = class UploadsService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(UploadsService_1.name);
        this.uploadDir = path.join(process.cwd(), 'uploads');
        this.s3Client = null;
        this.s3Bucket = '';
        this.storageType = this.config.get('STORAGE_TYPE', 'local');
        if (this.storageType === 's3') {
            this.s3Client = (0, s3_config_1.getS3Client)(this.config);
            this.s3Bucket = (0, s3_config_1.getS3Bucket)(this.config);
        }
    }
    async saveFile(file, subfolder) {
        if (!file)
            throw new common_1.BadRequestException('No file provided');
        const sanitized = sanitizeFilename(file.originalname);
        validateExtension(sanitized);
        const ext = path.extname(sanitized) || '.bin';
        const filename = `${(0, uuid_1.v4)()}${ext}`;
        if (this.storageType === 's3' && this.s3Client) {
            return this.saveToS3(file, subfolder, filename);
        }
        return this.saveToLocal(file, subfolder, filename);
    }
    async saveFiles(files, subfolder) {
        return Promise.all(files.map((f) => this.saveFile(f, subfolder)));
    }
    async saveToLocal(file, subfolder, filename) {
        const dir = path.join(this.uploadDir, subfolder);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        await fs.promises.writeFile(path.join(dir, filename), file.buffer);
        return `/uploads/${subfolder}/${filename}`;
    }
    async saveToS3(file, subfolder, filename) {
        const key = `${subfolder}/${filename}`;
        await this.s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: this.s3Bucket,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
        }));
        return `/uploads/${key}`;
    }
};
exports.UploadsService = UploadsService;
exports.UploadsService = UploadsService = UploadsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], UploadsService);
//# sourceMappingURL=uploads.service.js.map