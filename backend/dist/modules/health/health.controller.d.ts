import { PrismaService } from '../../database/prisma.service';
export declare class HealthController {
    private prisma;
    constructor(prisma: PrismaService);
    check(): Promise<{
        status: string;
        timestamp: string;
        message?: undefined;
    } | {
        status: string;
        timestamp: string;
        message: any;
    }>;
}
