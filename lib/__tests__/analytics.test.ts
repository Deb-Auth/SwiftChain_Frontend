import {
  normalizeApiPath,
  registerAnalyticsSink,
  resetAnalyticsForTests,
  sanitizeProperties,
  track,
  type AnalyticsEvent,
} from '@/lib/analytics';

describe('analytics', () => {
  beforeEach(() => {
    resetAnalyticsForTests();
    delete process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
    Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
  });

  it('delivers a typed event with timestamp, session id and path to sinks', () => {
    const sink = jest.fn();
    registerAnalyticsSink(sink);

    track('bid_submitted', { contractId: 'c-1' });

    expect(sink).toHaveBeenCalledTimes(1);
    const event = sink.mock.calls[0][0] as AnalyticsEvent;
    expect(event.name).toBe('bid_submitted');
    expect(event.properties).toEqual({ contractId: 'c-1' });
    expect(event.path).toBe(window.location.pathname);
    expect(typeof event.sessionId).toBe('string');
    expect(Number.isNaN(Date.parse(event.timestamp))).toBe(false);
  });

  it('reuses one session id within a page load', () => {
    const sink = jest.fn();
    registerAnalyticsSink(sink);
    track('bid_submitted', { contractId: 'a' });
    track('bid_submitted', { contractId: 'b' });
    expect(sink.mock.calls[0][0].sessionId).toBe(sink.mock.calls[1][0].sessionId);
  });

  it('does nothing when the user has enabled Do Not Track', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
    const sink = jest.fn();
    registerAnalyticsSink(sink);
    track('bid_submitted', { contractId: 'c-1' });
    expect(sink).not.toHaveBeenCalled();
  });

  it('does not throw when a sink fails and still calls the other sinks', () => {
    const good = jest.fn();
    registerAnalyticsSink(() => {
      throw new Error('sink down');
    });
    registerAnalyticsSink(good);
    expect(() => track('bid_submitted', { contractId: 'c-1' })).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('stops delivering after a sink is unregistered', () => {
    const sink = jest.fn();
    const unregister = registerAnalyticsSink(sink);
    unregister();
    track('bid_submitted', { contractId: 'c-1' });
    expect(sink).not.toHaveBeenCalled();
  });

  it('sends events to the configured endpoint via sendBeacon', () => {
    process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT = 'https://analytics.example.test/collect';
    const sendBeacon = jest.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true });

    track('tracking_connection_changed', { status: 'connected' });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe('https://analytics.example.test/collect');
  });

  it('falls back to fetch when sendBeacon declines the payload', () => {
    process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT = 'https://analytics.example.test/collect';
    Object.defineProperty(navigator, 'sendBeacon', {
      value: jest.fn().mockReturnValue(false),
      configurable: true,
    });
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    (global as unknown as { fetch: unknown }).fetch = fetchMock;

    track('tracking_connection_changed', { status: 'disconnected' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://analytics.example.test/collect',
      expect.objectContaining({ method: 'POST', keepalive: true }),
    );
  });

  describe('sanitizeProperties', () => {
    it('removes PII-looking keys and keeps safe ones', () => {
      const result = sanitizeProperties({
        contractId: 'c-1',
        email: 'a@b.com',
        walletAddress: 'GABC',
        phone: '123',
        authToken: 'x',
        packageSize: 'small',
      });
      expect(result).toEqual({ contractId: 'c-1', packageSize: 'small' });
    });

    it('is applied to dispatched events', () => {
      const sink = jest.fn();
      registerAnalyticsSink(sink);
      track('bid_submitted', { contractId: 'c-1', email: 'a@b.com' } as never);
      expect(sink.mock.calls[0][0].properties).toEqual({ contractId: 'c-1' });
    });
  });

  describe('normalizeApiPath', () => {
    it('drops origin, query and hash', () => {
      expect(normalizeApiPath('https://api.test/v1/deliveries?token=abc#x')).toBe(
        '/v1/deliveries',
      );
    });

    it('masks numeric and uuid segments', () => {
      expect(normalizeApiPath('/deliveries/123/events')).toBe('/deliveries/:id/events');
      expect(
        normalizeApiPath('/escrow/3f2b8c1e-1a2b-4c3d-8e9f-0123456789ab/release'),
      ).toBe('/escrow/:id/release');
    });

    it('handles missing urls', () => {
      expect(normalizeApiPath(undefined)).toBe('unknown');
    });
  });
});
