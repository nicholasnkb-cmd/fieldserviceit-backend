import { BadRequestException, Injectable } from '@nestjs/common';
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

  sanitizeCredentialInput(name: string, input: Record<string, unknown>): Record<string, string> {
    const provider = this.getProvider(name);
    const fields = provider.credentialFields || [];
    const allowed = new Set(fields.map((field) => field.key));
    const unknown = Object.keys(input).filter((key) => !allowed.has(key));
    if (unknown.length) throw new BadRequestException(`Unsupported credential fields: ${unknown.join(', ')}`);

    const sanitized: Record<string, string> = {};
    for (const [key, rawValue] of Object.entries(input)) {
      if (rawValue === null || rawValue === undefined || rawValue === '') continue;
      if (typeof rawValue !== 'string') throw new BadRequestException(`${key} must be a string`);
      const value = rawValue.trim();
      if (value.length > 4096) throw new BadRequestException(`${key} exceeds the maximum length`);
      if (/url$/i.test(key)) this.assertSafeUrl(key, value);
      sanitized[key] = value;
    }
    return sanitized;
  }

  private assertSafeUrl(field: string, value: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException(`${field} must be a valid URL`);
    }
    const developmentLocalhost = process.env.NODE_ENV !== 'production'
      && ['localhost', '127.0.0.1'].includes(url.hostname.toLowerCase());
    if (url.protocol !== 'https:' && !developmentLocalhost) {
      throw new BadRequestException(`${field} must use HTTPS`);
    }
    if (url.username || url.password) throw new BadRequestException(`${field} must not contain embedded credentials`);
  }
}
