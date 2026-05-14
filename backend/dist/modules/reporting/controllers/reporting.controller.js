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
exports.ReportingController = void 0;
const common_1 = require("@nestjs/common");
const reporting_service_1 = require("../services/reporting.service");
const jwt_auth_guard_1 = require("../../../common/guards/jwt-auth.guard");
const tenant_guard_1 = require("../../../common/guards/tenant.guard");
const business_only_guard_1 = require("../../../common/guards/business-only.guard");
const business_only_decorator_1 = require("../../../common/decorators/business-only.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
let ReportingController = class ReportingController {
    constructor(reportingService) {
        this.reportingService = reportingService;
    }
    getTicketSummary(from, to, user) {
        return this.reportingService.getTicketSummary(user.companyId, from, to);
    }
    getSlaCompliance(user) {
        return this.reportingService.getSlaCompliance(user.companyId);
    }
    getTechnicianPerformance(user) {
        return this.reportingService.getTechnicianPerformance(user.companyId);
    }
    getAssetInventory(user) {
        return this.reportingService.getAssetInventory(user.companyId);
    }
    getActivityFeed(user) {
        return this.reportingService.getActivityFeed(user.companyId);
    }
};
exports.ReportingController = ReportingController;
__decorate([
    (0, common_1.Get)('tickets'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ReportingController.prototype, "getTicketSummary", null);
__decorate([
    (0, common_1.Get)('sla'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ReportingController.prototype, "getSlaCompliance", null);
__decorate([
    (0, common_1.Get)('technician'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ReportingController.prototype, "getTechnicianPerformance", null);
__decorate([
    (0, common_1.Get)('assets'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ReportingController.prototype, "getAssetInventory", null);
__decorate([
    (0, common_1.Get)('activity'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ReportingController.prototype, "getActivityFeed", null);
exports.ReportingController = ReportingController = __decorate([
    (0, common_1.Controller)('reports'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, tenant_guard_1.TenantGuard, business_only_guard_1.BusinessOnlyGuard),
    (0, business_only_decorator_1.BusinessOnly)(),
    __metadata("design:paramtypes", [reporting_service_1.ReportingService])
], ReportingController);
//# sourceMappingURL=reporting.controller.js.map