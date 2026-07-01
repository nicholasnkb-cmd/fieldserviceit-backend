import { Injectable } from '@nestjs/common';
import { RmmProvider } from '../providers/rmm-provider.interface';
import { ConnectWiseProvider } from '../providers/connectwise.provider';
import { NinjaOneProvider } from '../providers/ninjaone.provider';
import { DattoProvider } from '../providers/datto.provider';
import { AteraProvider } from '../providers/atera.provider';
import { SyncroProvider } from '../providers/syncro.provider';
import { KaseyaProvider } from '../providers/kaseya.provider';
import { NableProvider } from '../providers/nable.provider';

@Injectable()
export class RmmProviderFactory {
  private providers = new Map<string, RmmProvider>();

  constructor(
    private connectwise: ConnectWiseProvider,
    private ninjaone: NinjaOneProvider,
    private datto: DattoProvider,
    private atera: AteraProvider,
    private syncro: SyncroProvider,
    private kaseya: KaseyaProvider,
    private nable: NableProvider,
  ) {
    [connectwise, ninjaone, datto, atera, syncro, kaseya, nable]
      .forEach((provider) => this.providers.set(provider.name, provider));
  }

  getProvider(name: string): RmmProvider {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) throw new Error(`Unsupported RMM provider: ${name}`);
    return provider;
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  listProviderDefinitions() {
    return Array.from(this.providers.values()).map((provider) => ({
      name: provider.name,
      label: provider.label || provider.name,
      helpText: provider.helpText || '',
      credentialFields: provider.credentialFields || [],
    }));
  }
}
