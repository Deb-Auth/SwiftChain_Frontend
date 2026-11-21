const requestUse = jest.fn();
const responseUse = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    defaults: { headers: { common: {} } },
    interceptors: {
      request: { use: requestUse },
      response: { use: responseUse },
    },
  },
}));

import httpClient from '@/lib/httpClient';
import { registerAnalyticsSink, resetAnalyticsForTests } from '@/lib/analytics';

describe('httpClient', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('configures the shared Axios client and installs both interceptors', () => {
    expect(httpClient.defaults.headers.common['Content-Type']).toBe('application/json');
    expect(requestUse).toHaveBeenCalledTimes(1);
    expect(responseUse).toHaveBeenCalledTimes(1);
  });

  it('adds the stored auth token to requests', () => {
    localStorage.setItem('authToken', 'token-123');
    const requestInterceptor = requestUse.mock.calls[0][0] as (config: {
      headers: Record<string, string>;
    }) => { headers: Record<string, string> };

    const config = requestInterceptor({ headers: {} });

    expect(config.headers.Authorization).toBe('Bearer token-123');
  });

  describe('failed request analytics', () => {
    const rejectedHandler = () =>
      responseUse.mock.calls[0][1] as (error: unknown) => Promise<never>;

    beforeEach(() => {
      resetAnalyticsForTests();
    });

    it('records api_request_failed with method, masked path and status only', async () => {
      const sink = jest.fn();
      registerAnalyticsSink(sink);

      await expect(
        rejectedHandler()({
          config: { method: 'post', url: '/escrow/12345/release?token=secret' },
          response: { status: 500 },
        }),
      ).rejects.toBeDefined();

      expect(sink).toHaveBeenCalledTimes(1);
      const event = sink.mock.calls[0][0];
      expect(event.name).toBe('api_request_failed');
      expect(event.properties).toEqual({
        method: 'POST',
        path: '/escrow/:id/release',
        status: 500,
      });
      expect(JSON.stringify(event)).not.toContain('secret');
    });

    it('records network failures that have no response', async () => {
      const sink = jest.fn();
      registerAnalyticsSink(sink);

      await expect(
        rejectedHandler()({ config: { url: '/deliveries' } }),
      ).rejects.toBeDefined();

      expect(sink.mock.calls[0][0].properties).toEqual({
        method: 'GET',
        path: '/deliveries',
        status: 'network_error',
      });
    });
  });
});
