import { RmmProvider, AssetMapping, AlertMapping } from './rmm-provider.interface';
export declare class ConnectWiseProvider implements RmmProvider {
    name: string;
    private baseUrl;
    private headers;
    validateCredentials(credentials: any): Promise<boolean>;
    syncAsset(assetData: any): Promise<AssetMapping>;
    syncAllAssets(credentials: any): Promise<AssetMapping[]>;
    createAlert(alertData: any): Promise<AlertMapping>;
    private mapAssetType;
    private getMockAssets;
}
