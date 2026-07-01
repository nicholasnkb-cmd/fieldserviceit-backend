import { Injectable } from '@nestjs/common';
import { RmmProvider, AssetMapping, AlertMapping, RmmConnectionResult } from './rmm-provider.interface';
import { LoggerService } from '../../../common/logger/logger.service';

@Injectable()
export class ConnectWiseProvider implements RmmProvider {
  name = 'connectwise';
  label = 'ConnectWise Manage';
  helpText = 'Use the Manage API URL for your region with your company ID, API keys, and ConnectWise client ID.';
  credentialFields = [
    { key: 'baseUrl', label: 'Manage API URL', required: true, placeholder: 'https://api-na.myconnectwise.net/v2024_1' },
    { key: 'companyId', label: 'Company ID', required: true },
    { key: 'publicKey', label: 'Public Key', required: true },
    { key: 'privateKey', label: 'Private Key', type: 'password', required: true },
    { key: 'clientId', label: 'Client ID', type: 'password', required: true },
  ];

  constructor(private readonly logger: LoggerService) {}

  private baseUrl(credentials: any): string {
    return String(credentials.baseUrl || 'https://api-na.myconnectwise.net/v2024_1').replace(/\/+$/, '');
  }

  private headers(credentials: any): Record<string, string> {
    const auth = Buffer.from(`${credentials.companyId}+${credentials.publicKey}:${credentials.privateKey}`).toString('base64');
    return {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      'clientId': credentials.clientId || '',
    };
  }

  async validateCredentials(credentials: any): Promise<boolean> {
    return (await this.testConnection(credentials)).valid;
  }

  async testConnection(credentials: any): Promise<RmmConnectionResult> {
    const missing = ['baseUrl', 'companyId', 'publicKey', 'privateKey', 'clientId'].filter((key) => !credentials?.[key]);
    if (missing.length) return { valid: false, message: `Missing required ConnectWise fields: ${missing.join(', ')}` };
    try {
      const res = await fetch(`${this.baseUrl(credentials)}/company/companies?pageSize=1`, {
        headers: this.headers(credentials),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok
        ? { valid: true, message: 'ConnectWise Manage accepted the API credentials.' }
        : { valid: false, statusCode: res.status, message: `ConnectWise returned HTTP ${res.status}. Verify the regional Manage API URL, company ID, API keys, and client ID.` };
    } catch (error: any) {
      return { valid: false, message: `ConnectWise could not be reached: ${error?.message || 'network error'}` };
    }
  }

  async syncAsset(assetData: any): Promise<AssetMapping> {
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

  async syncAllAssets(credentials: any): Promise<AssetMapping[]> {
    try {
      const res = await fetch(`${this.baseUrl(credentials)}/company/configurations?pageSize=500`, {
        headers: this.headers(credentials),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        this.logger.warn(`ConnectWise syncAllAssets failed: ${res.status} ${res.statusText}`);
        throw new Error(`ConnectWise asset sync failed with HTTP ${res.status}`);
      }

      const data = await res.json();
      return (data || []).map((item: any) => ({
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
    } catch (err: any) {
      this.logger.warn(`ConnectWise syncAllAssets error: ${err.message}`);
      throw err;
    }
  }

  async createAlert(alertData: any): Promise<AlertMapping> {
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
    } catch (err: any) {
      this.logger.warn(`ConnectWise createAlert error: ${err.message}`);
    }

    return { title: 'ConnectWise Alert', description: 'Alert received from ConnectWise', severity: 'warning', source: 'connectwise', raw: alertData };
  }

  private mapAssetType(type?: string): string {
    const map: Record<string, string> = {
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

}
