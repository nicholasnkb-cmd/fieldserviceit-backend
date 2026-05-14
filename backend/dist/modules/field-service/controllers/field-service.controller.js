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
exports.FieldServiceController = void 0;
const common_1 = require("@nestjs/common");
const field_service_service_1 = require("../services/field-service.service");
const jwt_auth_guard_1 = require("../../../common/guards/jwt-auth.guard");
const tenant_guard_1 = require("../../../common/guards/tenant.guard");
const business_only_guard_1 = require("../../../common/guards/business-only.guard");
const business_only_decorator_1 = require("../../../common/decorators/business-only.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
let FieldServiceController = class FieldServiceController {
    constructor(fieldService) {
        this.fieldService = fieldService;
    }
    dispatch(body, user) {
        if (!user.companyId)
            throw new common_1.ForbiddenException('No company context available');
        return this.fieldService.dispatch(body.ticketId, body.technicianId, user.companyId);
    }
    getBoard(user) {
        if (!user.companyId)
            throw new common_1.ForbiddenException('No company context available');
        return this.fieldService.getDispatchBoard(user.companyId);
    }
    updateStatus(id, status, user) {
        if (!user.companyId)
            throw new common_1.ForbiddenException('No company context available');
        return this.fieldService.updateStatus(id, status, user.companyId);
    }
    addNotes(id, notes, user) {
        if (!user.companyId)
            throw new common_1.ForbiddenException('No company context available');
        return this.fieldService.addNotes(id, notes, user.companyId);
    }
    addSignature(id, signature, user) {
        if (!user.companyId)
            throw new common_1.ForbiddenException('No company context available');
        return this.fieldService.addSignature(id, signature, user.companyId);
    }
    addPhotos(id, photoUrls, user) {
        if (!user.companyId)
            throw new common_1.ForbiddenException('No company context available');
        return this.fieldService.addPhotos(id, photoUrls, user.companyId);
    }
};
exports.FieldServiceController = FieldServiceController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], FieldServiceController.prototype, "dispatch", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FieldServiceController.prototype, "getBoard", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('status')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], FieldServiceController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Post)(':id/notes'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('notes')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], FieldServiceController.prototype, "addNotes", null);
__decorate([
    (0, common_1.Post)(':id/signature'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('signature')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], FieldServiceController.prototype, "addSignature", null);
__decorate([
    (0, common_1.Post)(':id/photos'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('photoUrls')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Array, Object]),
    __metadata("design:returntype", void 0)
], FieldServiceController.prototype, "addPhotos", null);
exports.FieldServiceController = FieldServiceController = __decorate([
    (0, common_1.Controller)('dispatch'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, tenant_guard_1.TenantGuard, business_only_guard_1.BusinessOnlyGuard),
    (0, business_only_decorator_1.BusinessOnly)(),
    __metadata("design:paramtypes", [field_service_service_1.FieldServiceService])
], FieldServiceController);
//# sourceMappingURL=field-service.controller.js.map