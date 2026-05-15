import { PrismaService } from '../../../database/prisma.service';
export declare class SettingsService {
    private prisma;
    constructor(prisma: PrismaService);
    getSettings(companyId: string): Promise<{
        settings: any;
        branding: any;
        id: string;
        name: string;
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
        id: string;
        name: string;
        domain: string;
        logo: string;
        branding: string;
        settings: string;
    }>;
    updateBranding(companyId: string, branding: {
        primaryColor?: string;
        logoUrl?: string;
        companyName?: string;
    }): Promise<{
        id: string;
        name: string;
        branding: string;
    }>;
}
