import { Injectable } from '@nestjs/common';
import { RmmProvider } from '../providers/rmm-provider.interface';
import { ConnectWiseProvider } from '../providers/connectwise.provider';
import { NinjaOneProvider } from '../providers/ninjaone.provider';
import { DattoProvider } from '../providers/datto.provider';

@Injectable()
export class RmmProviderFactory {
  private providers = new Map<string, RmmProvider>();

  constructor() {
    const connectwise = new ConnectWiseProvider();
    const ninjaone = new NinjaOneProvider();
    const datto = new DattoProvider();
    this.providers.set(connectwise.name, connectwise);
    this.providers.set(ninjaone.name, ninjaone);
    this.providers.set(datto.name, datto);
  }

  getProvider(name: string): RmmProvider {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) throw new Error(`Unsupported RMM provider: ${name}`);
    return provider;
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}
