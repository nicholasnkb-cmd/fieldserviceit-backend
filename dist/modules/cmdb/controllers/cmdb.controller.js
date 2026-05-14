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
exports.CmdbController = void 0;
const common_1 = require("@nestjs/common");
const cmdb_service_1 = require("../services/cmdb.service");
const jwt_auth_guard_1 = require("../../../common/guards/jwt-auth.guard");
const tenant_guard_1 = require("../../../common/guards/tenant.guard");
const business_only_guard_1 = require("../../../common/guards/business-only.guard");
const business_only_decorator_1 = require("../../../common/decorators/business-only.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
let CmdbController = class CmdbController {
    constructor(cmdbService) {
        this.cmdbService = cmdbService;
    }
    create(dto, user) {
        if (!user.companyId)
            throw new common_1.ForbiddenException('No company context available');
        return this.cmdbService.create(dto, user.companyId);
    }
    findAll(query, user) {
        if (!user.companyId)
            throw new common_1.ForbiddenException('No company context available');
        return this.cmdbService.findAll(user.companyId, query);
    }
    findOne(id, user) {
        if (!user.companyId)
            throw new common_1.ForbiddenException('No company context available');
        return this.cmdbService.findOne(id, user.companyId);
    }
    update(id, dto, user) {
        if (!user.companyId)
            throw new common_1.ForbiddenException('No company context available');
        return this.cmdbService.update(id, dto, user.companyId);
    }
    remove(id, user) {
        if (!user.companyId)
            throw new common_1.ForbiddenException('No company context available');
        return this.cmdbService.remove(id, user.companyId);
    }
};
exports.CmdbController = CmdbController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CmdbController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CmdbController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], CmdbController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], CmdbController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], CmdbController.prototype, "remove", null);
exports.CmdbController = CmdbController = __decorate([
    (0, common_1.Controller)('assets'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, tenant_guard_1.TenantGuard, business_only_guard_1.BusinessOnlyGuard),
    (0, business_only_decorator_1.BusinessOnly)(),
    __metadata("design:paramtypes", [cmdb_service_1.CmdbService])
], CmdbController);
//# sourceMappingURL=cmdb.controller.js.map