import { Injectable } from '@nestjs/common';
import { RmmProvider, AssetMapping, AlertMapping } from './rmm-provider.interface';
import { LoggerService } from '../../../common/logger/logger.service';

@Injectable()
export class DattoProvider implements RmmProvider {
  name = 'datto';
  label = 'Datto RMM';
  helpText = 'Connect with a Datto RMM API token. Add a site ID only when you want to limit synchronization to one site.';
  credentialFields = [
    { key: 'baseUrl', label: 'API Base URL', placeholder: 'https://api.datto.com/v1' },
    { key: 'apiToken', label: 'API Token', type: 'password', required: true },
    { key: 'siteId', label: 'Site ID (optional)' },
  ];

  constructor(private readonly logger: LoggerService) {}

  private baseUrl(credentials: any) {
    return String(credentials.baseUrl || 'https://api.datto.com/v1').replace(/\/+$/, '');
  }

  private headers(credentials: any): Record<string, string> {
    return {
      Authorization: `Bearer ${credentials.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  async validateCredentials(credentials: any): Promise<boolean> {
    if (!credentials?.apiToken) return false;
    try {
      const res = await fetch(`${this.baseUrl(credentials)}/sites?limit=1`, {
        headers: this.headers(credentials),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async syncAsset(assetData: any): Promise<AssetMapping> {
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

  async syncAllAssets(credentials: any): Promise<AssetMapping[]> {
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (credentials.siteId) params.set('siteId', credentials.siteId);
      const res = await fetch(`${this.baseUrl(credentials)}/devices?${params}`, {
        headers: this.headers(credentials),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        this.logger.warn(`Datto syncAllAssets failed: ${res.status}`);
        throw new Error(`Datto asset sync failed with HTTP ${res.status}`);
      }

      const data = await res.json();
      const devices = data.devices || data || [];
      return (Array.isArray(devices) ? devices : []).map((d: any) => ({
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
    } catch (err: any) {
      this.logger.warn(`Datto syncAllAssets error: ${err.message}`);
      throw err;
    }
  }

  async createAlert(alertData: any): Promise<AlertMapping> {
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

  private mapAssetType(type?: string): string {
    const map: Record<string, string> = {
      'server': 'SERVER',
      'workstation': 'WORKSTATION',
      'laptop': 'LAPTOP',
      'storage': 'STORAGE',
      'network': 'NETWORK',
      'virtual': 'VIRTUAL_MACHINE',
    };
    return type ? map[type.toLowerCase()] || 'OTHER' : 'OTHER';
  }

}
