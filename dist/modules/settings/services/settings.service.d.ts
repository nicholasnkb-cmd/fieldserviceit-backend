import { PrismaService } from '../../../database/prisma.service';
export declare class SettingsService {
    private prisma;
    constructor(prisma: PrismaService);
    getSettings(companyId: string): Promise<{
        settings: any;
        branding: any;
        name: string;
        id: string;
        slug: string;
        domain: string;
        logo: string;
    }>;
    updateSettings(companyId: string, dto: {
        name?: string;
        domain?: string;
        logo?: string;
        branding?: string;
        settings?: string;
    }): Promise<{
        name: string;
        id: string;
        domain: string;
        logo: string;
        settings: string;
        branding: string;
    }>;
    updateBranding(companyId: string, branding: {
        primaryColor?: string;
        logoUrl?: string;
        companyName?: string;
    }): Promise<{
        name: string;
        id: string;
        branding: string;
    }>;
}
