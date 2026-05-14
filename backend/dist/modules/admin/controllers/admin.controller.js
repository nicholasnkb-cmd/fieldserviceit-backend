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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const admin_service_1 = require("../services/admin.service");
const jwt_auth_guard_1 = require("../../../common/guards/jwt-auth.guard");
const business_only_guard_1 = require("../../../common/guards/business-only.guard");
const roles_guard_1 = require("../../../common/guards/roles.guard");
const roles_decorator_1 = require("../../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
let AdminController = class AdminController {
    constructor(adminService) {
        this.adminService = adminService;
    }
    listPermissions() {
        return this.adminService.listPermissions();
    }
    listRoles(user) {
        const companyId = user.role === 'SUPER_ADMIN' ? undefined : user.companyId;
        return this.adminService.listRoles(companyId);
    }
    getRole(id) {
        return this.adminService.getRole(id);
    }
    createRole(dto) {
        return this.adminService.createRole(dto);
    }
    updateRole(id, dto) {
        return this.adminService.updateRole(id, dto);
    }
    deleteRole(id) {
        return this.adminService.deleteRole(id);
    }
    assignUserRole(userId, roleId) {
        return this.adminService.assignUserRole(userId, roleId);
    }
    removeUserRole(userId, roleId) {
        return this.adminService.removeUserRole(userId, roleId);
    }
    getUserRoles(id) {
        return this.adminService.getUserRoles(id);
    }
    listRolesLegacy() {
        return this.adminService.listRolesLegacy();
    }
    listUsers(query) {
        return this.adminService.listUsers(query);
    }
    getUser(id) {
        return this.adminService.getUser(id);
    }
    createUser(dto) {
        return this.adminService.createUser(dto);
    }
    updateUserRole(id, role) {
        return this.adminService.updateUserRole(id, role);
    }
    updateUser(id, dto) {
        return this.adminService.updateUser(id, dto);
    }
    removeUser(id) {
        return this.adminService.removeUser(id);
    }
    listCompanies(query) {
        return this.adminService.listCompanies(query);
    }
    createCompany(dto) {
        return this.adminService.createCompany(dto);
    }
    updateCompany(id, dto) {
        return this.adminService.updateCompany(id, dto);
    }
    removeCompany(id) {
        return this.adminService.removeCompany(id);
    }
    generateInviteCode(id, expiresInDays) {
        return this.adminService.generateInviteCode(id, expiresInDays);
    }
    listAuditLogs(query) {
        return this.adminService.listAuditLogs(query);
    }
    getStats() {
        return this.adminService.getGlobalStats();
    }
    listCompanyRoles(user) {
        return this.adminService.listRoles(user.companyId);
    }
    createCompanyRole(dto, user) {
        return this.adminService.createRole({ ...dto, companyId: user.companyId });
    }
    updateCompanyRole(id, dto, user) {
        return this.adminService.updateRole(id, dto);
    }
    deleteCompanyRole(id) {
        return this.adminService.deleteRole(id);
    }
    listCompanyUsers(query, user) {
        return this.adminService.listCompanyUsers(user.companyId, query);
    }
    createCompanyUser(dto, user) {
        return this.adminService.createCompanyUser(dto, user.companyId);
    }
    getCompanyUser(id, user) {
        return this.adminService.getCompanyUser(id, user.companyId);
    }
    updateCompanyUserRole(id, role, user) {
        return this.adminService.updateCompanyUserRole(id, role, user.companyId);
    }
    removeCompanyUser(id, user) {
        return this.adminService.removeCompanyUser(id, user.companyId);
    }
    generateCompanyInviteCode(user, expiresInDays) {
        return this.adminService.generateInviteCode(user.companyId, expiresInDays);
    }
    getCompanySettings(user) {
        return this.adminService.getCompanySettings(user.companyId);
    }
    updateCompanySettings(dto, user) {
        return this.adminService.updateCompanySettings(user.companyId, dto);
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('permissions'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'TENANT_ADMIN'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listPermissions", null);
__decorate([
    (0, common_1.Get)('roles'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'TENANT_ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listRoles", null);
__decorate([
    (0, common_1.Get)('roles/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'TENANT_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getRole", null);
__decorate([
    (0, common_1.Post)('roles'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createRole", null);
__decorate([
    (0, common_1.Patch)('roles/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'TENANT_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateRole", null);
__decorate([
    (0, common_1.Delete)('roles/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteRole", null);
__decorate([
    (0, common_1.Post)('users/:userId/roles/:roleId'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'TENANT_ADMIN'),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Param)('roleId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "assignUserRole", null);
__decorate([
    (0, common_1.Delete)('users/:userId/roles/:roleId'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'TENANT_ADMIN'),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Param)('roleId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "removeUserRole", null);
__decorate([
    (0, common_1.Get)('users/:id/roles'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'TENANT_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getUserRoles", null);
__decorate([
    (0, common_1.Get)('roles-legacy'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'TENANT_ADMIN'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listRolesLegacy", null);
__decorate([
    (0, common_1.Get)('users'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listUsers", null);
__decorate([
    (0, common_1.Get)('users/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getUser", null);
__decorate([
    (0, common_1.Post)('users'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createUser", null);
__decorate([
    (0, common_1.Patch)('users/:id/role'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateUserRole", null);
__decorate([
    (0, common_1.Patch)('users/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateUser", null);
__decorate([
    (0, common_1.Delete)('users/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "removeUser", null);
__decorate([
    (0, common_1.Get)('companies'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listCompanies", null);
__decorate([
    (0, common_1.Post)('companies'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createCompany", null);
__decorate([
    (0, common_1.Patch)('companies/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateCompany", null);
__decorate([
    (0, common_1.Delete)('companies/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "removeCompany", null);
__decorate([
    (0, common_1.Post)('companies/:id/invite-code'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('expiresInDays')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "generateInviteCode", null);
__decorate([
    (0, common_1.Get)('audit-logs'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listAuditLogs", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('company/roles'),
    (0, roles_decorator_1.Roles)('TENANT_ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listCompanyRoles", null);
__decorate([
    (0, common_1.Post)('company/roles'),
    (0, roles_decorator_1.Roles)('TENANT_ADMIN'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createCompanyRole", null);
__decorate([
    (0, common_1.Patch)('company/roles/:id'),
    (0, roles_decorator_1.Roles)('TENANT_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateCompanyRole", null);
__decorate([
    (0, common_1.Delete)('company/roles/:id'),
    (0, roles_decorator_1.Roles)('TENANT_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteCompanyRole", null);
__decorate([
    (0, common_1.Get)('company/users'),
    (0, roles_decorator_1.Roles)('TENANT_ADMIN'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listCompanyUsers", null);
__decorate([
    (0, common_1.Post)('company/users'),
    (0, roles_decorator_1.Roles)('TENANT_ADMIN'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createCompanyUser", null);
__decorate([
    (0, common_1.Get)('company/users/:id'),
    (0, roles_decorator_1.Roles)('TENANT_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getCompanyUser", null);
__decorate([
    (0, common_1.Patch)('company/users/:id/role'),
    (0, roles_decorator_1.Roles)('TENANT_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('role')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateCompanyUserRole", null);
__decorate([
    (0, common_1.Delete)('company/users/:id'),
    (0, roles_decorator_1.Roles)('TENANT_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "removeCompanyUser", null);
__decorate([
    (0, common_1.Post)('company/invite-code'),
    (0, roles_decorator_1.Roles)('TENANT_ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)('expiresInDays')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "generateCompanyInviteCode", null);
__decorate([
    (0, common_1.Get)('company/settings'),
    (0, roles_decorator_1.Roles)('TENANT_ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getCompanySettings", null);
__decorate([
    (0, common_1.Patch)('company/settings'),
    (0, roles_decorator_1.Roles)('TENANT_ADMIN'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateCompanySettings", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, business_only_guard_1.BusinessOnlyGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map