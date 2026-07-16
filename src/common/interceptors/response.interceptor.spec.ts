import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor compatibility', () => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getResponse: () => ({ setHeader: jest.fn() }) }),
  } as any;

  it('keeps object fields at the top level while adding the standard envelope', async () => {
    const interceptor = new ResponseInterceptor(reflector as any);
    const result: any = await lastValueFrom(interceptor.intercept(context, { handle: () => of({ status: 'ok' }) } as any));
    expect(result).toMatchObject({ success: true, status: 'ok', data: { status: 'ok' } });
    expect(result.timestamp).toBeTruthy();
  });

  it('preserves raw arrays for legacy list consumers', async () => {
    const interceptor = new ResponseInterceptor(reflector as any);
    const result = await lastValueFrom(interceptor.intercept(context, { handle: () => of([{ id: 'one' }]) } as any));
    expect(result).toEqual([{ id: 'one' }]);
  });

  it('retains paginated data and metadata envelopes', async () => {
    const interceptor = new ResponseInterceptor(reflector as any);
    const result: any = await lastValueFrom(interceptor.intercept(context, { handle: () => of({ data: [{ id: 'one' }], meta: { total: 1 } }) } as any));
    expect(result).toMatchObject({ success: true, data: [{ id: 'one' }], meta: { total: 1 } });
  });
});
