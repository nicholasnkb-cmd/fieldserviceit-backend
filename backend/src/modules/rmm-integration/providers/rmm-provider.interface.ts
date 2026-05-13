export interface AssetMapping {
  name?: string;
  assetType?: string;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  os?: string;
  ipAddress?: string;
  macAddress?: string;
  status?: string;
  location?: string;
  id?: string;
}

export interface AlertMapping {
  title?: string;
  description?: string;
  severity?: string;
  category?: string;
  source?: string;
  alertId?: string;
  deviceName?: string;
  timestamp?: string;
  raw?: any;
}

export interface RmmProvider {
  name: string;
  syncAsset(assetData: any): Promise<AssetMapping>;
  syncAllAssets(credentials: any): Promise<AssetMapping[]>;
  createAlert(alertData: any): Promise<AlertMapping>;
  validateCredentials(credentials: any): Promise<boolean>;
}
