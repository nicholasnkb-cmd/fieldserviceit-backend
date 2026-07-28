import { BadRequestException } from '@nestjs/common';
import { RmmProviderFactory } from './rmm-provider-factory.service';

describe('RmmProviderFactory credential policy', () => {
  const provider = {
    name: 'connectwise',
    label: 'ConnectWise',
    credentialFields: [
      { key: 'baseUrl', label: 'Base URL' },
      { key: 'apiKey', label: 'API key', type: 'password' },
    ],
  };

  function factory() {
    return new RmmProviderFactory(
      provider as any,
      { name: 'ninjaone' } as any,
      { name: 'datto' } as any,
      { name: 'atera' } as any,
      { name: 'syncro' } as any,
      { name: 'kaseya' } as any,
      { name: 'nable' } as any,
    );
  }

  it('keeps only declared string credentials and trims them', () => {
    expect(factory().sanitizeCredentialInput('connectwise', {
      baseUrl: ' https://api.example.com/v1 ',
      apiKey: ' secret ',
    })).toEqual({ baseUrl: 'https://api.example.com/v1', apiKey: 'secret' });
  });

  it('rejects undeclared fields', () => {
    expect(() => factory().sanitizeCredentialInput('connectwise', {
      apiKey: 'secret',
      injected: 'value',
    })).toThrow(BadRequestException);
  });

  it('rejects insecure production URLs and embedded credentials', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => factory().sanitizeCredentialInput('connectwise', {
        baseUrl: 'http://api.example.com',
      })).toThrow('must use HTTPS');
      expect(() => factory().sanitizeCredentialInput('connectwise', {
        baseUrl: 'https://user:password@api.example.com',
      })).toThrow('must not contain embedded credentials');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('rejects non-string and oversized values', () => {
    expect(() => factory().sanitizeCredentialInput('connectwise', { apiKey: 123 })).toThrow('must be a string');
    expect(() => factory().sanitizeCredentialInput('connectwise', { apiKey: 'x'.repeat(4097) })).toThrow('maximum length');
  });
});
