"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FieldServiceModule = void 0;
const common_1 = require("@nestjs/common");
const field_service_controller_1 = require("./controllers/field-service.controller");
const field_service_service_1 = require("./services/field-service.service");
const tickets_module_1 = require("../tickets/tickets.module");
let FieldServiceModule = class FieldServiceModule {
};
exports.FieldServiceModule = FieldServiceModule;
exports.FieldServiceModule = FieldServiceModule = __decorate([
    (0, common_1.Module)({
        imports: [tickets_module_1.TicketsModule],
        controllers: [field_service_controller_1.FieldServiceController],
        providers: [field_service_service_1.FieldServiceService],
        exports: [field_service_service_1.FieldServiceService],
    })
], FieldServiceModule);
//# sourceMappingURL=field-service.module.js.map