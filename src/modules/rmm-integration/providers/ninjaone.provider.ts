import { Injectable } from '@nestjs/common';
import { RmmProvider, AssetMapping, AlertMapping } from './rmm-provider.interface';
import { LoggerService } from '../../../common/logger/logger.service';

@Injectable()
export class NinjaOneProvider implements RmmProvider {
  name = 'ninjaone';
  label = 'NinjaOne';
  helpText = 'Use an API Services application with the Client Credentials grant and Monitoring scope. Legacy bearer tokens remain supported.';
  credentialFields = [
    { key: 'instanceUrl', label: 'Instance URL', required: true, placeholder: 'https://app.ninjarmm.com' },
    { key: 'clientId', label: 'OAuth Client ID', required: true },
    { key: 'clientSecret', label: 'OAuth Client Secret', type: 'password', required: true },
    { key: 'scope', label: 'OAuth Scope', placeholder: 'monitoring' },
    { key: 'accessToken', label: 'Legacy Access Token', type: 'password' },
  ];

  constructor(private readonly logger: LoggerService) {}

  private baseUrl(credentials: any): string {
    const instance = credentials.instanceUrl?.replace(/\/+$/, '');
    return instance || 'https://app.ninjarmm.com';
  }

  private async accessToken(credentials: any): Promise<string | null> {
    const legacyToken = credentials.accessToken || credentials.apiKey;
    if (legacyToken) return legacyToken;
    if (!credentials.clientId || !credentials.clientSecret) return null;

    const response = await fetch(`${this.baseUrl(credentials)}/ws/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: credentials.scope || 'monitoring',
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const payload: any = await response.json();
    return payload.access_token || null;
  }

  private headers(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async validateCredentials(credentials: any): Promise<boolean> {
    if (!credentials?.instanceUrl || (!credentials?.apiKey && !credentials?.accessToken && (!credentials?.clientId || !credentials?.clientSecret))) return false;
    try {
      const accessToken = await this.accessToken(credentials);
      if (!accessToken) return false;
      const res = await fetch(`${this.baseUrl(credentials)}/api/v2/devices?pageSize=1`, {
        headers: this.headers(accessToken),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async syncAsset(assetData: any): Promise<AssetMapping> {
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

  async syncAllAssets(credentials: any): Promise<AssetMapping[]> {
    try {
      const accessToken = await this.accessToken(credentials);
      if (!accessToken) throw new Error('NinjaOne OAuth credentials are invalid');
      const res = await fetch(`${this.baseUrl(credentials)}/api/v2/devices?pageSize=500`, {
        headers: this.headers(accessToken),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        this.logger.warn(`NinjaOne syncAllAssets failed: ${res.status}`);
        throw new Error(`NinjaOne asset sync failed with HTTP ${res.status}`);
      }

      const data = await res.json();
      const devices = data.results || data || [];
      return (Array.isArray(devices) ? devices : []).map((d: any) => ({
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
    } catch (err: any) {
      this.logger.warn(`NinjaOne syncAllAssets error: ${err.message}`);
      throw err;
    }
  }

  async createAlert(alertData: any): Promise<AlertMapping> {
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

  private mapAssetType(type?: string): string {
    const map: Record<string, string> = {
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

}
