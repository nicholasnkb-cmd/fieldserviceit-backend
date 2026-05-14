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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const uploads_service_1 = require("./uploads.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const tenant_guard_1 = require("../../common/guards/tenant.guard");
const business_only_guard_1 = require("../../common/guards/business-only.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const SIGNATURE_MIMES = ['image/png', 'image/jpeg'];
const AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const MAX_SIGNATURE_SIZE = 2 * 1024 * 1024;
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
function mimeFilter(allowed) {
    return (req, file, cb) => {
        if (allowed.includes(file.mimetype))
            return cb(null, true);
        cb(new common_1.UnprocessableEntityException(`File type ${file.mimetype} not allowed. Accepted: ${allowed.join(', ')}`), false);
    };
}
let UploadsController = class UploadsController {
    constructor(uploadsService) {
        this.uploadsService = uploadsService;
    }
    uploadPhotos(files, user) {
        const companyDir = user.companyId || 'public';
        return this.uploadsService.saveFiles(files, `photos/${companyDir}`);
    }
    uploadSignature(file, user) {
        const companyDir = user.companyId || 'public';
        return this.uploadsService.saveFile(file, `signatures/${companyDir}`);
    }
    uploadAvatar(file) {
        return this.uploadsService.saveFile(file, 'avatars');
    }
    uploadTicketFiles(files, user) {
        const companyDir = user.companyId || 'public';
        return this.uploadsService.saveFiles(files, `tickets/${companyDir}`);
    }
};
exports.UploadsController = UploadsController;
__decorate([
    (0, common_1.Post)('photo'),
    (0, common_1.UseGuards)(business_only_guard_1.BusinessOnlyGuard),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('photos', 10, {
        limits: { fileSize: MAX_PHOTO_SIZE },
        fileFilter: mimeFilter(PHOTO_MIMES),
    })),
    __param(0, (0, common_1.UploadedFiles)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object]),
    __metadata("design:returntype", void 0)
], UploadsController.prototype, "uploadPhotos", null);
__decorate([
    (0, common_1.Post)('signature'),
    (0, common_1.UseGuards)(business_only_guard_1.BusinessOnlyGuard),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('signature', {
        limits: { fileSize: MAX_SIGNATURE_SIZE },
        fileFilter: mimeFilter(SIGNATURE_MIMES),
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], UploadsController.prototype, "uploadSignature", null);
__decorate([
    (0, common_1.Post)('avatar'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('avatar', {
        limits: { fileSize: MAX_AVATAR_SIZE },
        fileFilter: mimeFilter(AVATAR_MIMES),
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], UploadsController.prototype, "uploadAvatar", null);
__decorate([
    (0, common_1.Post)('ticket'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('files', 10, {
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: mimeFilter(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
    })),
    __param(0, (0, common_1.UploadedFiles)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object]),
    __metadata("design:returntype", void 0)
], UploadsController.prototype, "uploadTicketFiles", null);
exports.UploadsController = UploadsController = __decorate([
    (0, common_1.Controller)('uploads'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, tenant_guard_1.TenantGuard),
    __metadata("design:paramtypes", [uploads_service_1.UploadsService])
], UploadsController);
//# sourceMappingURL=uploads.controller.js.map