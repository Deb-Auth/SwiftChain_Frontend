import { QueryClient } from '@tanstack/react-query';
import {
  invalidateAfterEscrowMutation,
  invalidateDeliveryData,
  invalidateWalletData,
} from '@/lib/cacheInvalidation';

const setup = () => {
  const queryClient = new QueryClient();
  const spy = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
  const keys = () => spy.mock.calls.map((c) => c[0]?.queryKey);
  return { queryClient, spy, keys };
};

describe('cacheInvalidation', () => {
  it('invalidates delivery and shipment lists when no ids are given', async () => {
    const { queryClient, keys } = setup();
    await invalidateDeliveryData(queryClient);
    expect(keys()).toEqual([['deliveries'], ['shipments']]);
  });

  it('also invalidates detail-level keys for the given ids', async () => {
    const { queryClient, keys } = setup();
    await invalidateDeliveryData(queryClient, { deliveryId: 'd1', shipmentId: 's1' });
    expect(keys()).toEqual(
      expect.arrayContaining([
        ['deliveries'],
        ['delivery', 'd1'],
        ['statusTimeline', 'd1'],
        ['milestoneTimeline', 'd1'],
        ['handoffQR', 'd1'],
        ['shipment', 's1'],
      ]),
    );
  });

  it('invalidates wallet and driver earnings caches', async () => {
    const { queryClient, keys } = setup();
    await invalidateWalletData(queryClient);
    expect(keys()).toEqual([['wallet'], ['driverEarnings'], ['transaction']]);
  });

  it('refreshes escrow, delivery and wallet data after an escrow mutation', async () => {
    const { queryClient, keys } = setup();
    await invalidateAfterEscrowMutation(queryClient, { escrowId: 'e1', deliveryId: 'd1' });
    expect(keys()).toEqual(
      expect.arrayContaining([
        ['escrowPayout', 'e1'],
        ['escrowPayoutFeeQuote', 'e1'],
        ['settlementBreakdown', 'e1'],
        ['delivery', 'd1'],
        ['driverEarnings'],
      ]),
    );
  });

  it('still invalidates remaining keys when one refetch rejects', async () => {
    const { queryClient, spy } = setup();
    spy.mockRejectedValueOnce(new Error('refetch failed'));
    await expect(invalidateWalletData(queryClient)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('marks real cached queries stale', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['delivery', 'd1'], { id: 'd1' });
    queryClient.setQueryData(['driverEarnings', 'summary'], { availableXlm: 1 });
    await invalidateDeliveryData(queryClient, { deliveryId: 'd1' });
    await invalidateWalletData(queryClient);
    expect(queryClient.getQueryState(['delivery', 'd1'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['driverEarnings', 'summary'])?.isInvalidated).toBe(true);
  });
});
