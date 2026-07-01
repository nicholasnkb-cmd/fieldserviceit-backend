import { Injectable } from '@nestjs/common';
import { AlertMapping, AssetMapping, RmmConnectionResult, RmmProvider } from './rmm-provider.interface';

@Injectable()
export class KaseyaProvider implements RmmProvider {
  name = 'kaseya';
  label = 'Kaseya VSA';
  helpText = 'Connect to a Kaseya VSA instance with a bearer token and instance URL.';
  credentialFields = [
    { key: 'baseUrl', label: 'VSA Instance URL', required: true },
    { key: 'apiToken', label: 'API Token', type: 'password', required: true },
  ];
  private baseUrl(credentials: any) { return String(credentials.baseUrl || '').replace(/\/+$/, ''); }
  private headers(credentials: any) { return { Authorization: `Bearer ${credentials.apiToken}`, Accept: 'application/json' }; }
  async validateCredentials(credentials: any) {
    return (await this.testConnection(credentials)).valid;
  }
  async testConnection(credentials: any): Promise<RmmConnectionResult> {
    if (!credentials?.baseUrl || !credentials?.apiToken) return { valid: false, message: 'Kaseya VSA instance URL and API token are required.' };
    try {
      const response = await fetch(`${this.baseUrl(credentials)}/api/v1.0/assetmgmt/agents?$top=1`, { headers: this.headers(credentials), signal: AbortSignal.timeout(10000) });
      return response.ok
        ? { valid: true, message: 'Kaseya VSA accepted the instance URL and token.' }
        : { valid: false, statusCode: response.status, message: `Kaseya VSA returned HTTP ${response.status}. Verify the instance URL, token, and asset-management permissions.` };
    } catch (error: any) {
      return { valid: false, message: `Kaseya VSA could not be reached: ${error?.message || 'network error'}` };
    }
  }
  async syncAllAssets(credentials: any): Promise<AssetMapping[]> {
    const response = await fetch(`${this.baseUrl(credentials)}/api/v1.0/assetmgmt/agents?$top=1000`, { headers: this.headers(credentials), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Kaseya VSA asset sync failed with HTTP ${response.status}`);
    const payload: any = await response.json();
    return Promise.all((payload.Result || payload.value || []).map((item: any) => this.syncAsset(item)));
  }
  async syncAsset(item: any): Promise<AssetMapping> {
    return { name: item.AgentName || item.ComputerName, assetType: String(item.OSType || '').toLowerCase().includes('server') ? 'SERVER' : 'WORKSTATION', serialNumber: item.SerialNumber, manufacturer: item.Manufacturer, model: item.ProductName, os: item.OSInfo || item.OSType, ipAddress: item.IPAddress, status: item.Online ? 'ACTIVE' : 'INACTIVE', location: item.MachineGroup };
  }
  async createAlert(alert: any): Promise<AlertMapping> {
    return { title: alert.Subject || alert.title || 'Kaseya VSA alert', description: alert.Message || alert.description, severity: alert.Severity || 'warning', source: this.name, alertId: String(alert.AlarmId || alert.id || ''), deviceName: alert.AgentName, raw: alert };
  }
}
