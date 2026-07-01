import { Injectable } from '@nestjs/common';
import { AlertMapping, AssetMapping, RmmConnectionResult, RmmProvider } from './rmm-provider.interface';

@Injectable()
export class SyncroProvider implements RmmProvider {
  name = 'syncro';
  label = 'Syncro';
  helpText = 'Connect with a Syncro API token and your account subdomain or API base URL.';
  credentialFields = [
    { key: 'apiToken', label: 'API Token', type: 'password', required: true },
    { key: 'subdomain', label: 'Account Subdomain' },
    { key: 'baseUrl', label: 'API Base URL' },
  ];

  private baseUrl(credentials: any) {
    return String(credentials.baseUrl || `https://${credentials.subdomain}.syncromsp.com/api/v1`).replace(/\/+$/, '');
  }
  private headers(credentials: any) {
    return { Authorization: `Bearer ${credentials.apiToken}`, Accept: 'application/json' };
  }
  async validateCredentials(credentials: any) {
    return (await this.testConnection(credentials)).valid;
  }
  async testConnection(credentials: any): Promise<RmmConnectionResult> {
    if (!credentials?.apiToken) return { valid: false, message: 'Syncro API token is required.' };
    if (!credentials?.subdomain && !credentials?.baseUrl) return { valid: false, message: 'Syncro account subdomain or API base URL is required.' };
    try {
      const response = await fetch(`${this.baseUrl(credentials)}/customer_assets?page=1`, { headers: this.headers(credentials), signal: AbortSignal.timeout(10000) });
      return response.ok
        ? { valid: true, message: 'Syncro accepted the account URL and API token.' }
        : { valid: false, statusCode: response.status, message: `Syncro returned HTTP ${response.status}. Verify the account subdomain and token permissions.` };
    } catch (error: any) {
      return { valid: false, message: `Syncro could not be reached: ${error?.message || 'network error'}` };
    }
  }
  async syncAllAssets(credentials: any): Promise<AssetMapping[]> {
    const response = await fetch(`${this.baseUrl(credentials)}/customer_assets?page=1`, { headers: this.headers(credentials), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Syncro asset sync failed with HTTP ${response.status}`);
    const payload: any = await response.json();
    return Promise.all((payload.assets || payload.customer_assets || []).map((item: any) => this.syncAsset(item)));
  }
  async syncAsset(item: any): Promise<AssetMapping> {
    return { name: item.name || item.asset_name, assetType: item.asset_type || 'OTHER', serialNumber: item.serial_number, manufacturer: item.properties?.manufacturer, model: item.properties?.model, os: item.properties?.os_name, ipAddress: item.properties?.ip_address, status: item.disabled ? 'INACTIVE' : 'ACTIVE', location: item.customer?.business_name };
  }
  async createAlert(alert: any): Promise<AlertMapping> {
    return { title: alert.subject || alert.title || 'Syncro alert', description: alert.body || alert.description, severity: alert.severity || 'warning', source: this.name, alertId: String(alert.id || ''), deviceName: alert.asset_name, raw: alert };
  }
}
