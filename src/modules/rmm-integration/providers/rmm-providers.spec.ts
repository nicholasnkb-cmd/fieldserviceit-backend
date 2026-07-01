import { LoggerService } from '../../../common/logger/logger.service';
import { DattoProvider } from './datto.provider';
import { NableProvider } from './nable.provider';
import { NinjaOneProvider } from './ninjaone.provider';

describe('RMM provider configuration', () => {
  const logger = { warn: jest.fn() } as unknown as LoggerService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires a Datto API token even when a site ID is present', async () => {
    const provider = new DattoProvider(logger);

    await expect(provider.validateCredentials({ siteId: 'site-1' })).resolves.toBe(false);
    await expect(provider.testConnection({ siteId: 'site-1' })).resolves.toEqual({
      valid: false,
      message: 'Datto API token is required.',
    });
  });

  it('omits the Datto site filter when no site ID is configured', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ devices: [] }),
    } as Response);
    const provider = new DattoProvider(logger);

    await provider.syncAllAssets({ apiToken: 'token' });

    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.datto.com/v1/devices?limit=500');
  });

  it('uses NinjaOne client credentials and the API v2 device endpoint', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'oauth-token' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response);
    const provider = new NinjaOneProvider(logger);

    await expect(provider.validateCredentials({
      instanceUrl: 'https://eu.ninjarmm.com/',
      clientId: 'client',
      clientSecret: 'secret',
    })).resolves.toBe(true);

    expect(String(fetchMock.mock.calls[0][0])).toBe('https://eu.ninjarmm.com/ws/oauth/token');
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://eu.ninjarmm.com/api/v2/devices?pageSize=1');
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBe('Bearer oauth-token');
  });

  it('returns a sanitized NinjaOne OAuth diagnostic', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);
    const provider = new NinjaOneProvider(logger);

    const result = await provider.testConnection({
      instanceUrl: 'https://app.ninjarmm.com',
      clientId: 'client',
      clientSecret: 'do-not-return-this-secret',
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain('OAuth token endpoint returned HTTP 401');
    expect(result.message).not.toContain('do-not-return-this-secret');
  });

  it('uses the N-able territory API key endpoint and parses XML devices', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/xml' }),
      text: async () => '<result><items><device><deviceid>7</deviceid><name>Workstation 7</name></device></items></result>',
    } as Response);
    const provider = new NableProvider();

    await expect(provider.syncAllAssets({
      baseUrl: 'https://www.systemmonitor.us/',
      apiToken: 'key with spaces',
    })).resolves.toEqual([
      expect.objectContaining({ name: 'Workstation 7' }),
    ]);

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://www.systemmonitor.us/api/?apikey=key+with+spaces&service=list_devices',
    );
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
