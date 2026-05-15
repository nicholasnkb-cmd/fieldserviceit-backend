import { SettingsService } from '../services/settings.service';
export declare class SettingsController {
    private settingsService;
    constructor(settingsService: SettingsService);
    getSettings(user: any): Promise<{
        settings: any;
        branding: any;
        id: string;
        name: string;
        slug: string;
        domain: string;
        logo: string;
    }>;
    updateSettings(dto: any, user: any): Promise<{
        id: string;
        name: string;
        domain: string;
        logo: string;
        branding: string;
        settings: string;
    }>;
    updateBranding(branding: {
        primaryColor?: string;
        logoUrl?: string;
        companyName?: string;
    }, user: any): Promise<{
        id: string;
        name: string;
        branding: string;
    }>;
}
