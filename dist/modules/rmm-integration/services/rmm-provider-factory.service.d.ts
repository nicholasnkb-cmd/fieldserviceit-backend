import { RmmProvider } from '../providers/rmm-provider.interface';
export declare class RmmProviderFactory {
    private providers;
    constructor();
    getProvider(name: string): RmmProvider;
    listProviders(): string[];
}
