import { SettingsService } from '../services/settings.service';
export declare class SettingsController {
    private settingsService;
    constructor(settingsService: SettingsService);
    getSettings(user: any): Promise<{
        settings: any;
        branding: any;
        constructor: {
            name: "RowDataPacket";
        };
    }>;
    updateSettings(dto: any, user: any): Promise<import("mysql2").RowDataPacket>;
    updateBranding(branding: {
        primaryColor?: string;
        logoUrl?: string;
        companyName?: string;
    }, user: any): Promise<import("mysql2").RowDataPacket>;
}
