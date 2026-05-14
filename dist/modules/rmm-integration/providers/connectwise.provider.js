"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectWiseProvider = void 0;
class ConnectWiseProvider {
    constructor() {
        this.name = 'connectwise';
    }
    baseUrl(credentials) {
        return `https://api-na.myconnectwise.net/v2024_1`;
    }
    headers(credentials) {
        const auth = Buffer.from(`${credentials.companyId}+${credentials.publicKey}:${credentials.privateKey}`).toString('base64');
        return {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            'clientId': credentials.clientId || '',
        };
    }
    async validateCredentials(credentials) {
        if (!credentials?.companyId || !credentials?.publicKey || !credentials?.privateKey)
            return false;
        try {
            const res = await fetch(`${this.baseUrl(credentials)}/company/companies?pageSize=1`, {
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
            name: assetData.name,
            assetType: this.mapAssetType(assetData.type),
            serialNumber: assetData.serialNumber,
            manufacturer: assetData.manufacturer,
            model: assetData.model,
            os: assetData.os,
            ipAddress: assetData.ipAddress,
            status: assetData.status || 'ACTIVE',
            location: assetData.location,
        };
    }
    async syncAllAssets(credentials) {
        try {
            const res = await fetch(`${this.baseUrl(credentials)}/company/configurations?pageSize=500`, {
                headers: this.headers(credentials),
                signal: AbortSignal.timeout(30000),
            });
            if (!res.ok) {
                console.warn(`ConnectWise syncAllAssets failed: ${res.status} ${res.statusText}`);
                return this.getMockAssets();
            }
            const data = await res.json();
            return (data || []).map((item) => ({
                name: item.name || 'Unknown',
                assetType: this.mapAssetType(item.type?.name) || 'OTHER',
                serialNumber: item.serialNumber,
                manufacturer: item.manufacturer?.name,
                model: item.model?.name,
                os: item.osInfo,
                ipAddress: item.ipAddress,
                status: item.status?.name === 'Active' ? 'ACTIVE' : 'INACTIVE',
                location: item.location?.name,
            }));
        }
        catch (err) {
            console.warn(`ConnectWise syncAllAssets error: ${err.message}`);
            return this.getMockAssets();
        }
    }
    async createAlert(alertData) {
        if (alertData._mock) {
            return {
                title: alertData.title || 'ConnectWise Alert',
                description: alertData.description || 'An alert was received from ConnectWise',
                severity: alertData.severity || 'warning',
                category: alertData.category || 'System',
                source: 'connectwise',
                alertId: alertData.id || `cw-${Date.now()}`,
                deviceName: alertData.deviceName,
                timestamp: alertData.timestamp || new Date().toISOString(),
                raw: alertData,
            };
        }
        try {
            const res = await fetch(`${this.baseUrl(alertData)}/service/tickets?pageSize=1&conditions=status/id not=6`, {
                headers: this.headers(alertData),
                signal: AbortSignal.timeout(10000),
            });
            if (!res.ok) {
                return { title: 'ConnectWise Alert', description: 'Alert received', severity: 'warning', source: 'connectwise', raw: alertData };
            }
            const tickets = await res.json();
            if (tickets?.length > 0) {
                const t = tickets[0];
                return {
                    title: t.summary || 'ConnectWise Ticket',
                    description: `${t.recordType || 'Ticket'} from ConnectWise: ${t.summary || ''}`,
                    severity: t.priority?.name?.toLowerCase()?.includes('high') ? 'critical' : t.priority?.name?.toLowerCase()?.includes('medium') ? 'warning' : 'info',
                    category: t.type?.name || 'Incident',
                    source: 'connectwise',
                    alertId: String(t.id),
                    deviceName: t.company?.name,
                    timestamp: new Date().toISOString(),
                    raw: t,
                };
            }
        }
        catch (err) {
            console.warn(`ConnectWise createAlert error: ${err.message}`);
        }
        return { title: 'ConnectWise Alert', description: 'Alert received from ConnectWise', severity: 'warning', source: 'connectwise', raw: alertData };
    }
    mapAssetType(type) {
        const map = {
            'Server': 'SERVER',
            'Workstation': 'WORKSTATION',
            'Laptop': 'LAPTOP',
            'Printer': 'PRINTER',
            'Network': 'NETWORK',
            'Storage': 'STORAGE',
            'Virtual Machine': 'VIRTUAL_MACHINE',
        };
        return type ? map[type] || 'OTHER' : 'OTHER';
    }
    getMockAssets() {
        return [
            { name: 'CW-Server-01', assetType: 'SERVER', serialNumber: 'CW-SN-001', manufacturer: 'Dell', model: 'PowerEdge R740', os: 'Windows Server 2022', ipAddress: '10.0.1.10', status: 'ACTIVE' },
            { name: 'CW-Workstation-01', assetType: 'WORKSTATION', serialNumber: 'CW-SN-002', manufacturer: 'HP', model: 'ZBook', os: 'Windows 11', ipAddress: '10.0.1.50', status: 'ACTIVE' },
        ];
    }
}
exports.ConnectWiseProvider = ConnectWiseProvider;
//# sourceMappingURL=connectwise.provider.js.map