import { Injectable } from '@nestjs/common';
import { AlertMapping, AssetMapping, RmmProvider } from './rmm-provider.interface';
import { XMLParser } from 'fast-xml-parser';

@Injectable()
export class NableProvider implements RmmProvider {
  name = 'nable';
  label = 'N-able N-sight';
  helpText = 'Use the API server URL and API key from N-sight General Settings. The server URL is territory-specific.';
  credentialFields = [
    { key: 'baseUrl', label: 'Territory API Server URL', required: true, placeholder: 'https://www.systemmonitor.us' },
    { key: 'apiToken', label: 'API Key', type: 'password', required: true },
    { key: 'devicesPath', label: 'Devices Path' },
  ];
  private url(credentials: any) {
    const baseUrl = String(credentials.baseUrl || '').replace(/\/+$/, '');
    if (credentials.devicesPath) return `${baseUrl}${credentials.devicesPath.startsWith('/') ? '' : '/'}${credentials.devicesPath}`;
    const params = new URLSearchParams({ apikey: credentials.apiToken, service: 'list_devices' });
    return `${baseUrl}/api/?${params}`;
  }
  private headers(credentials: any): Record<string, string> {
    return credentials.devicesPath
      ? { Authorization: `Bearer ${credentials.apiToken}`, Accept: 'application/json, application/xml' }
      : { Accept: 'application/json, application/xml' };
  }
  async validateCredentials(credentials: any) {
    if (!credentials?.baseUrl || !credentials?.apiToken) return false;
    try { return (await fetch(this.url(credentials), { headers: this.headers(credentials), signal: AbortSignal.timeout(10000) })).ok; } catch { return false; }
  }
  async syncAllAssets(credentials: any): Promise<AssetMapping[]> {
    const response = await fetch(this.url(credentials), { headers: this.headers(credentials), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`N-able asset sync failed with HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    const payload: any = contentType.includes('json')
      ? await response.json()
      : new XMLParser({ ignoreAttributes: false }).parse(await response.text());
    const devices = this.devicesFromPayload(payload);
    return Promise.all(devices.map((item: any) => this.syncAsset(item)));
  }
  async syncAsset(item: any): Promise<AssetMapping> {
    return { name: item.name || item.deviceName || item.hostname, assetType: item.deviceType || 'OTHER', serialNumber: item.serialNumber, manufacturer: item.manufacturer, model: item.model, os: item.operatingSystem || item.os, ipAddress: item.ipAddress, status: item.online === false ? 'INACTIVE' : 'ACTIVE', location: item.siteName || item.clientName };
  }
  async createAlert(alert: any): Promise<AlertMapping> {
    return { title: alert.name || alert.title || 'N-able alert', description: alert.description || alert.message, severity: alert.severity || 'warning', source: this.name, alertId: String(alert.id || ''), deviceName: alert.deviceName, raw: alert };
  }

  private devicesFromPayload(payload: any): any[] {
    const candidates = [
      payload?.devices,
      payload?.items,
      payload?.result?.items?.device,
      payload?.result?.device,
      payload?.response?.items?.device,
      payload?.response?.device,
      payload,
    ];
    const devices = candidates.find((value) => Array.isArray(value) || (value && typeof value === 'object' && ('deviceid' in value || 'deviceId' in value)));
    if (!devices) return [];
    return Array.isArray(devices) ? devices : [devices];
  }
}
