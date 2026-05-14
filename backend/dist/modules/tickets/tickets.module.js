"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketsModule = void 0;
const common_1 = require("@nestjs/common");
const tickets_controller_1 = require("./controllers/tickets.controller");
const tickets_service_1 = require("./services/tickets.service");
const ticket_timeline_service_1 = require("./services/ticket-timeline.service");
const ticket_export_service_1 = require("./services/ticket-export.service");
const tickets_gateway_1 = require("./events/tickets.gateway");
const notifications_module_1 = require("../notifications/notifications.module");
let TicketsModule = class TicketsModule {
};
exports.TicketsModule = TicketsModule;
exports.TicketsModule = TicketsModule = __decorate([
    (0, common_1.Module)({
        imports: [notifications_module_1.NotificationsModule],
        controllers: [tickets_controller_1.TicketsController],
        providers: [tickets_service_1.TicketsService, ticket_timeline_service_1.TicketTimelineService, ticket_export_service_1.TicketExportService, tickets_gateway_1.TicketsGateway],
        exports: [tickets_service_1.TicketsService, tickets_gateway_1.TicketsGateway, ticket_timeline_service_1.TicketTimelineService],
    })
], TicketsModule);
//# sourceMappingURL=tickets.module.js.map