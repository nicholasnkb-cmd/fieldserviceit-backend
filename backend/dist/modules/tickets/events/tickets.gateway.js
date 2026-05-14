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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketsGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
let TicketsGateway = class TicketsGateway {
    constructor() {
        this.onlineUsers = new Map();
    }
    handleJoinCompany(client, companyId) {
        client.join(`company:${companyId}`);
    }
    handleOnline(client, data) {
        client.data.userId = data.userId;
        client.data.companyId = data.companyId;
        if (!this.onlineUsers.has(data.companyId))
            this.onlineUsers.set(data.companyId, new Set());
        this.onlineUsers.get(data.companyId).add(data.userId);
        this.server.to(`company:${data.companyId}`).emit('presence:update', { online: Array.from(this.onlineUsers.get(data.companyId)) });
    }
    handleDisconnect(client) {
        if (client.data.userId && client.data.companyId) {
            const set = this.onlineUsers.get(client.data.companyId);
            if (set) {
                set.delete(client.data.userId);
                this.server.to(`company:${client.data.companyId}`).emit('presence:update', { online: Array.from(set) });
            }
        }
    }
    getOnlineUsers(companyId) {
        return Array.from(this.onlineUsers.get(companyId) || []);
    }
    notifyTicketUpdate(companyId, event, data) {
        this.server.to(`company:${companyId}`).emit(event, data);
    }
};
exports.TicketsGateway = TicketsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], TicketsGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('joinCompany'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, String]),
    __metadata("design:returntype", void 0)
], TicketsGateway.prototype, "handleJoinCompany", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('presence:online'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], TicketsGateway.prototype, "handleOnline", null);
exports.TicketsGateway = TicketsGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({ cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:3000' } })
], TicketsGateway);
//# sourceMappingURL=tickets.gateway.js.map