"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DattoProvider = void 0;
class DattoProvider {
    constructor() {
        this.name = 'datto';
        this.baseUrl = 'https://api.datto.com/v1';
    }
    headers(credentials) {
        return {
            Authorization: `Bearer ${credentials.apiToken}`,
            'Content-Type': 'application/json',
        };
    }
    async validateCredentials(credentials) {
        if (!credentials?.apiToken && !credentials?.siteId)
            return false;
        try {
            const res = await fetch(`${this.baseUrl}/sites?limit=1`, {
                headers: this.headers(credentials),
                signal: AbortSignal.timeout(10000),
            });
            return res.ok;
        }
        catch {
            return false;
        }
    }
    async syncAsset(assetData) {
        return {
            name: assetData.name || assetData.hostname,
            assetType: this.mapAssetType(assetData.type),
            serialNumber: assetData.serialNumber,
            manufacturer: assetData.manufacturer,
            model: assetData.model,
            os: assetData.os,
            ipAddress: assetData.ipAddress,
            status: 'ACTIVE',
            location: assetData.site,
        };
    }
    async syncAllAssets(credentials) {
        try {
            const res = await fetch(`${this.baseUrl}/devices?limit=500&siteId=${credentials.siteId}`, {
                headers: this.headers(credentials),
                signal: AbortSignal.timeout(30000),
            });
            if (!res.ok) {
                console.warn(`Datto syncAllAssets failed: ${res.status}`);
                return this.getMockAssets();
            }
            const data = await res.json();
            const devices = data.devices || data || [];
            return (Array.isArray(devices) ? devices : []).map((d) => ({
                name: d.hostname || d.name || 'Unknown',
                assetType: this.mapAssetType(d.type),
                serialNumber: d.serialNumber,
                manufacturer: d.manufacturer,
                model: d.model,
                os: d.os,
                ipAddress: d.ipAddress,
                status: d.status === 'online' ? 'ACTIVE' : 'INACTIVE',
                location: d.site?.name || credentials.siteId,
            }));
        }
        catch (err) {
            console.warn(`Datto syncAllAssets error: ${err.message}`);
            return this.getMockAssets();
        }
    }
    async createAlert(alertData) {
        return {
            title: alertData.title || `Datto Alert: ${alertData.alertType || 'System Notification'}`,
            description: alertData.description || alertData.message || 'Alert from Datto RMM',
            severity: alertData.severity === 'critical' || alertData.alertType === 'backup_failed' ? 'critical'
                : alertData.severity === 'warning' ? 'warning' : 'info',
            category: alertData.category || 'Backup',
            source: 'datto',
            alertId: alertData.id || `datto-${Date.now()}`,
            deviceName: alertData.deviceName || alertData.hostname,
            timestamp: alertData.timestamp || alertData.createdAt || new Date().toISOString(),
            raw: alertData,
        };
    }
    mapAssetType(type) {
        const map = {
            'server': 'SERVER',
            'workstation': 'WORKSTATION',
            'laptop': 'LAPTOP',
            'storage': 'STORAGE',
            'network': 'NETWORK',
            'virtual': 'VIRTUAL_MACHINE',
        };
        return type ? map[type.toLowerCase()] || 'OTHER' : 'OTHER';
    }
    getMockAssets() {
        return [
            { name: 'Datto-Backup-Server', assetType: 'SERVER', serialNumber: 'D-SN-001', manufacturer: 'Datto', model: 'Siris 4', os: 'Datto Linux', ipAddress: '10.0.3.10', status: 'ACTIVE' },
            { name: 'Datto-NAS-01', assetType: 'STORAGE', serialNumber: 'D-SN-002', manufacturer: 'Datto', model: 'Alto 3', os: 'Datto Linux', ipAddress: '10.0.3.20', status: 'ACTIVE' },
        ];
    }
}
exports.DattoProvider = DattoProvider;
//# sourceMappingURL=datto.provider.js.map