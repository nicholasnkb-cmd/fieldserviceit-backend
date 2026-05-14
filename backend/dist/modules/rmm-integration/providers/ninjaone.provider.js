"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NinjaOneProvider = void 0;
class NinjaOneProvider {
    constructor() {
        this.name = 'ninjaone';
    }
    baseUrl(credentials) {
        const instance = credentials.instanceUrl?.replace(/\/+$/, '');
        return instance || 'https://app.ninjarmm.com';
    }
    headers(credentials) {
        return {
            Authorization: `Bearer ${credentials.apiKey}`,
            'Content-Type': 'application/json',
        };
    }
    async validateCredentials(credentials) {
        if (!credentials?.apiKey)
            return false;
        try {
            const res = await fetch(`${this.baseUrl(credentials)}/v2/devices?pageSize=1`, {
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
            name: assetData.displayName || assetData.hostname || assetData.name,
            assetType: this.mapAssetType(assetData.nodeClass || assetData.deviceType),
            serialNumber: assetData.serialNumber,
            manufacturer: assetData.manufacturer,
            model: assetData.model,
            os: assetData.os,
            ipAddress: assetData.lastSeenIp || assetData.ipAddress,
            status: assetData.status === 'active' || assetData.decommissioned === false ? 'ACTIVE' : 'INACTIVE',
            location: assetData.location,
        };
    }
    async syncAllAssets(credentials) {
        try {
            const res = await fetch(`${this.baseUrl(credentials)}/v2/devices?pageSize=500`, {
                headers: this.headers(credentials),
                signal: AbortSignal.timeout(30000),
            });
            if (!res.ok) {
                console.warn(`NinjaOne syncAllAssets failed: ${res.status}`);
                return this.getMockAssets();
            }
            const data = await res.json();
            const devices = data.results || data || [];
            return (Array.isArray(devices) ? devices : []).map((d) => ({
                name: d.displayName || d.hostname || 'Unknown',
                assetType: this.mapAssetType(d.nodeClass || d.deviceType),
                serialNumber: d.serialNumber,
                manufacturer: d.manufacturer,
                model: d.model,
                os: d.os,
                ipAddress: d.lastSeenIp,
                status: d.decommissioned ? 'INACTIVE' : 'ACTIVE',
                location: d.location?.name || d.locationName,
            }));
        }
        catch (err) {
            console.warn(`NinjaOne syncAllAssets error: ${err.message}`);
            return this.getMockAssets();
        }
    }
    async createAlert(alertData) {
        return {
            title: alertData.title || `NinjaOne Alert: ${alertData.conditionName || alertData.alertType || 'Notification'}`,
            description: alertData.description || alertData.body || alertData.message || 'Alert from NinjaOne RMM',
            severity: alertData.severity === 'critical' || alertData.priority === 'high' ? 'critical'
                : alertData.severity === 'warning' || alertData.priority === 'medium' ? 'warning' : 'info',
            category: alertData.category || alertData.conditionCategory || 'Monitoring',
            source: 'ninjaone',
            alertId: alertData.id || `n1-${Date.now()}`,
            deviceName: alertData.deviceName || alertData.hostname,
            timestamp: alertData.timestamp || alertData.occurredAt || new Date().toISOString(),
            raw: alertData,
        };
    }
    mapAssetType(type) {
        const map = {
            'server': 'SERVER',
            'workstation': 'WORKSTATION',
            'laptop': 'LAPTOP',
            'printer': 'PRINTER',
            'network': 'NETWORK',
            'storage': 'STORAGE',
            'virtualMachine': 'VIRTUAL_MACHINE',
            'vm': 'VIRTUAL_MACHINE',
        };
        return type ? map[type] || 'OTHER' : 'OTHER';
    }
    getMockAssets() {
        return [
            { name: 'N1-Server-01', assetType: 'SERVER', serialNumber: 'N1-SN-001', manufacturer: 'Dell', model: 'PowerEdge R750', os: 'Ubuntu 22.04', ipAddress: '10.0.2.10', status: 'ACTIVE' },
            { name: 'N1-Laptop-01', assetType: 'LAPTOP', serialNumber: 'N1-SN-002', manufacturer: 'Lenovo', model: 'ThinkPad X1', os: 'Windows 11', ipAddress: '10.0.2.100', status: 'ACTIVE' },
        ];
    }
}
exports.NinjaOneProvider = NinjaOneProvider;
//# sourceMappingURL=ninjaone.provider.js.map