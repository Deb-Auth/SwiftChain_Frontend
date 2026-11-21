/**
 * Analytics instrumentation: verifies that the key conversion and operational
 * flows emit the expected events through the analytics sink, and that failures
 * in those flows are still reported accurately.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  registerAnalyticsSink,
  resetAnalyticsForTests,
  type AnalyticsEvent,
} from '@/lib/analytics';

const mockSuccess = jest.fn();
const mockError = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ success: mockSuccess, error: mockError }),
}));

jest.mock('@/services/deliveries.service', () => ({
  deliveriesService: { createDelivery: jest.fn() },
}));

jest.mock('@/services/biddingService', () => ({
  biddingService: {
    getContracts: jest.fn().mockResolvedValue([]),
    getBidHistory: jest.fn().mockResolvedValue([]),
    submitBid: jest.fn(),
  },
}));

jest.mock('@/services/escrowService', () => ({
  escrowService: { releaseEscrow: jest.fn(), getEscrowDetails: jest.fn() },
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

import { useCreateDelivery } from '@/hooks/useCreateDelivery';
import { useBidding } from '@/hooks/useBidding';
import { useEscrowRelease } from '@/hooks/useEscrowRelease';
import { deliveriesService } from '@/services/deliveries.service';
import { biddingService } from '@/services/biddingService';
import { escrowService } from '@/services/escrowService';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('analytics instrumentation', () => {
  let events: AnalyticsEvent[];

  beforeEach(() => {
    jest.clearAllMocks();
    resetAnalyticsForTests();
    Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
    events = [];
    registerAnalyticsSink((event) => events.push(event));
  });

  describe('useCreateDelivery', () => {
    const values = {
      pickupAddress: '12 Marina Road, Lagos',
      destination: '5 Ikeja Way, Lagos',
      packageSize: 'medium' as const,
      description: 'A box of documents',
      recipientName: 'Ada Okafor',
      recipientPhone: '+2348000000001',
      recipientEmail: 'ada@example.com',
    };

    it('records delivery_request_created without any recipient or address data', async () => {
      (deliveriesService.createDelivery as jest.Mock).mockResolvedValue({ id: 'd-1' });
      const { result } = renderHook(() => useCreateDelivery(), { wrapper });

      await act(async () => {
        await result.current.onSubmit(values);
      });

      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('delivery_request_created');
      expect(events[0].properties).toEqual({ packageSize: 'medium' });
      expect(JSON.stringify(events[0])).not.toMatch(/ada@example|Marina|Okafor|2348000000001/);
    });

    it('records nothing when creation fails', async () => {
      (deliveriesService.createDelivery as jest.Mock).mockRejectedValue(new Error('nope'));
      jest.spyOn(console, 'error').mockImplementation();
      const { result } = renderHook(() => useCreateDelivery(), { wrapper });

      await act(async () => {
        await result.current.onSubmit(values).catch(() => undefined);
      });

      expect(events).toHaveLength(0);
    });
  });

  describe('useBidding', () => {
    it('records bid_submitted with the contract id only (no amount)', async () => {
      (biddingService.submitBid as jest.Mock).mockResolvedValue({ confirmationId: 'conf-1' });
      const { result } = renderHook(() => useBidding(), { wrapper });

      await act(async () => {
        await result.current.submitBid('contract-9', 1500, '2 days');
      });

      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('bid_submitted');
      expect(events[0].properties).toEqual({ contractId: 'contract-9' });
    });

    it('records nothing when the bid is rejected', async () => {
      (biddingService.submitBid as jest.Mock).mockRejectedValue(new Error('rejected'));
      const { result } = renderHook(() => useBidding(), { wrapper });

      await act(async () => {
        await result.current.submitBid('contract-9', 1500, '2 days').catch(() => undefined);
      });
      await waitFor(() => expect(mockError).toHaveBeenCalled());

      expect(events).toHaveLength(0);
    });
  });

  describe('useEscrowRelease', () => {
    it('records escrow_release_succeeded', async () => {
      (escrowService.releaseEscrow as jest.Mock).mockResolvedValue({
        success: true,
        transactionHash: 'abc123def456ghi',
      });
      const { result } = renderHook(() => useEscrowRelease());

      await act(async () => {
        await result.current.confirmAndRelease('esc-1', 'del-1', 'GWALLET');
      });

      expect(events.map((e) => e.name)).toEqual(['escrow_release_succeeded']);
      expect(events[0].properties).toEqual({ escrowId: 'esc-1', deliveryId: 'del-1' });
      // The wallet address and transaction hash must never be sent
      expect(JSON.stringify(events[0])).not.toMatch(/GWALLET|abc123def456ghi/);
    });

    it('records escrow_release_failed when the release throws', async () => {
      (escrowService.releaseEscrow as jest.Mock).mockRejectedValue(new Error('revert'));
      const { result } = renderHook(() => useEscrowRelease());

      await act(async () => {
        await result.current.confirmAndRelease('esc-1', 'del-1', 'GWALLET');
      });

      expect(events.map((e) => e.name)).toEqual(['escrow_release_failed']);
    });

    it('records escrow_release_failed when the service reports success: false', async () => {
      (escrowService.releaseEscrow as jest.Mock).mockResolvedValue({
        success: false,
        message: 'not enough signatures',
      });
      const { result } = renderHook(() => useEscrowRelease());

      await act(async () => {
        await result.current.confirmAndRelease('esc-1', 'del-1', 'GWALLET');
      });

      expect(events.map((e) => e.name)).toEqual(['escrow_release_failed']);
    });
  });
});
