import { SettingsService } from '../services/settings.service';
export declare class SettingsController {
    private settingsService;
    constructor(settingsService: SettingsService);
    getSettings(user: any): Promise<{
        settings: any;
        branding: any;
        name: string;
        id: string;
        slug: string;
        domain: string;
        logo: string;
    }>;
    updateSettings(dto: any, user: any): Promise<{
        name: string;
        id: string;
        domain: string;
        logo: string;
        settings: string;
        branding: string;
    }>;
    updateBranding(branding: {
        primaryColor?: string;
        logoUrl?: string;
        companyName?: string;
    }, user: any): Promise<{
        name: string;
        id: string;
        branding: string;
    }>;
}
