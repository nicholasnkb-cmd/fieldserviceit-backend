import { PrismaService } from '../../../database/prisma.service';
export declare class SettingsService {
    private prisma;
    constructor(prisma: PrismaService);
    getSettings(companyId: string): Promise<{
        settings: any;
        branding: any;
        constructor: {
            name: "RowDataPacket";
        };
    }>;
    updateSettings(companyId: string, dto: {
        name?: string;
        domain?: string;
        logo?: string;
        branding?: string;
        settings?: string;
    }): Promise<import("mysql2").RowDataPacket>;
    updateBranding(companyId: string, branding: {
        primaryColor?: string;
        logoUrl?: string;
        companyName?: string;
    }): Promise<import("mysql2").RowDataPacket>;
}
