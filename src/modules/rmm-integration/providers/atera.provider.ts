import { Injectable } from '@nestjs/common';
import { AlertMapping, AssetMapping, RmmProvider } from './rmm-provider.interface';

@Injectable()
export class AteraProvider implements RmmProvider {
  name = 'atera';
  label = 'Atera';
  helpText = 'Connect with an Atera API key and optionally override the API base URL.';
  credentialFields = [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    { key: 'baseUrl', label: 'API Base URL' },
  ];

  private baseUrl(credentials: any) {
    return String(credentials.baseUrl || 'https://app.atera.com/api/v3').replace(/\/+$/, '');
  }

  private headers(credentials: any) {
    return { 'X-API-KEY': credentials.apiKey, Accept: 'application/json' };
  }

  async validateCredentials(credentials: any) {
    if (!credentials?.apiKey) return false;
    try {
      return (await fetch(`${this.baseUrl(credentials)}/agents?page=1&itemsInPage=1`, {
        headers: this.headers(credentials), signal: AbortSignal.timeout(10000),
      })).ok;
    } catch { return false; }
  }

  async syncAllAssets(credentials: any): Promise<AssetMapping[]> {
    const response = await fetch(`${this.baseUrl(credentials)}/agents?page=1&itemsInPage=1000`, {
      headers: this.headers(credentials), signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Atera asset sync failed with HTTP ${response.status}`);
    const payload: any = await response.json();
    const devices = payload.items || payload.Items || payload;
    return Promise.all((Array.isArray(devices) ? devices : []).map((item: any) => this.syncAsset(item)));
  }

  async syncAsset(item: any): Promise<AssetMapping> {
    return {
      name: item.MachineName || item.machineName || item.DeviceName,
      assetType: String(item.SystemType || '').toLowerCase().includes('server') ? 'SERVER' : 'WORKSTATION',
      serialNumber: item.VendorSerialNumber || item.serialNumber,
      manufacturer: item.Vendor || item.manufacturer,
      model: item.VendorBrandModel || item.model,
      os: item.OS || item.os,
      ipAddress: item.IPAddresses?.[0] || item.ipAddress,
      status: item.Online === false ? 'INACTIVE' : 'ACTIVE',
      location: item.CustomerName || item.FolderName,
    };
  }

  async createAlert(alert: any): Promise<AlertMapping> {
    return { title: alert.Title || alert.title || 'Atera alert', description: alert.Description || alert.message, severity: alert.Severity || 'warning', source: this.name, alertId: String(alert.AlertID || alert.id || ''), deviceName: alert.DeviceName, raw: alert };
  }
}
