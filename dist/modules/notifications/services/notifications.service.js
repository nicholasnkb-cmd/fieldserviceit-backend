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
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
let NotificationsService = class NotificationsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto) {
        const notification = await this.prisma.notification.create({
            data: {
                userId: dto.userId,
                companyId: dto.companyId,
                title: dto.title,
                body: dto.body,
                type: dto.type || 'info',
                link: dto.link,
            },
        });
        return notification;
    }
    async findAll(userId, query) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 25;
        const skip = (page - 1) * limit;
        const where = { userId };
        if (query.unreadOnly)
            where.isRead = false;
        const [data, total] = await Promise.all([
            this.prisma.notification.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
            this.prisma.notification.count({ where }),
        ]);
        return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }
    async markAsRead(id, userId) {
        return this.prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
    }
    async markAllAsRead(userId) {
        return this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    }
    async unreadCount(userId) {
        const count = await this.prisma.notification.count({ where: { userId, isRead: false } });
        return { count };
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map