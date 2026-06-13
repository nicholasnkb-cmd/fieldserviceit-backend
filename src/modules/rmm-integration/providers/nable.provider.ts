import { Injectable } from '@nestjs/common';
import { AlertMapping, AssetMapping, RmmProvider } from './rmm-provider.interface';

@Injectable()
export class NableProvider implements RmmProvider {
  name = 'nable';
  label = 'N-able N-sight';
  helpText = 'Connect an N-able N-sight tenant using its API service URL and access token.';
  credentialFields = [
    { key: 'baseUrl', label: 'API Service URL', required: true },
    { key: 'apiToken', label: 'API Token', type: 'password', required: true },
    { key: 'devicesPath', label: 'Devices Path' },
  ];
  private url(credentials: any) { return `${String(credentials.baseUrl || '').replace(/\/+$/, '')}${credentials.devicesPath || '/devices'}`; }
  private headers(credentials: any) { return { Authorization: `Bearer ${credentials.apiToken}`, Accept: 'application/json' }; }
  async validateCredentials(credentials: any) {
    if (!credentials?.baseUrl || !credentials?.apiToken) return false;
    try { return (await fetch(this.url(credentials), { headers: this.headers(credentials), signal: AbortSignal.timeout(10000) })).ok; } catch { return false; }
  }
  async syncAllAssets(credentials: any): Promise<AssetMapping[]> {
    const response = await fetch(this.url(credentials), { headers: this.headers(credentials), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`N-able asset sync failed with HTTP ${response.status}`);
    const payload: any = await response.json();
    return Promise.all((payload.devices || payload.items || payload || []).map((item: any) => this.syncAsset(item)));
  }
  async syncAsset(item: any): Promise<AssetMapping> {
    return { name: item.name || item.deviceName || item.hostname, assetType: item.deviceType || 'OTHER', serialNumber: item.serialNumber, manufacturer: item.manufacturer, model: item.model, os: item.operatingSystem || item.os, ipAddress: item.ipAddress, status: item.online === false ? 'INACTIVE' : 'ACTIVE', location: item.siteName || item.clientName };
  }
  async createAlert(alert: any): Promise<AlertMapping> {
    return { title: alert.name || alert.title || 'N-able alert', description: alert.description || alert.message, severity: alert.severity || 'warning', source: this.name, alertId: String(alert.id || ''), deviceName: alert.deviceName, raw: alert };
  }
}
