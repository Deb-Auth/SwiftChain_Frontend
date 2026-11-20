import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

export interface DeliveryInvalidationTarget {
  /** Delivery whose detail, timeline and handoff queries should refresh. */
  deliveryId?: string;
  /** Shipment whose detail query should refresh. */
  shipmentId?: string;
}

export interface EscrowInvalidationTarget extends DeliveryInvalidationTarget {
  escrowId?: string;
}

/**
 * Runs every invalidation and resolves once all refetches settle. One failed
 * refetch must not prevent the other caches from being marked stale, so
 * individual rejections are swallowed (queries surface their own error state).
 */
async function invalidateAll(
  queryClient: QueryClient,
  keys: ReadonlyArray<readonly unknown[]>,
): Promise<void> {
  await Promise.allSettled(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

/**
 * Invalidate delivery and shipment caches after a mutation that changes
 * delivery state (create, cancel, handoff, status change).
 *
 * Lists are always invalidated; detail-level keys only when an id is given.
 */
export function invalidateDeliveryData(
  queryClient: QueryClient,
  { deliveryId, shipmentId }: DeliveryInvalidationTarget = {},
): Promise<void> {
  const keys: Array<readonly unknown[]> = [
    queryKeys.deliveries.all,
    queryKeys.shipments.all,
  ];
  if (deliveryId) {
    keys.push(
      queryKeys.deliveries.detail(deliveryId),
      queryKeys.deliveries.statusTimeline(deliveryId),
      queryKeys.deliveries.milestoneTimeline(deliveryId),
      queryKeys.deliveries.handoffQR(deliveryId),
    );
  }
  if (shipmentId) keys.push(queryKeys.shipments.detail(shipmentId));
  return invalidateAll(queryClient, keys);
}

/**
 * Invalidate wallet-related caches (earnings summary, payouts, transactions)
 * after a mutation that moves funds (withdrawal, escrow release, refund).
 */
export function invalidateWalletData(queryClient: QueryClient): Promise<void> {
  return invalidateAll(queryClient, [
    queryKeys.wallet.all,
    queryKeys.wallet.driverEarnings,
    queryKeys.wallet.transactions,
  ]);
}

/**
 * Escrow mutations (lock, release, refund) change delivery state and wallet
 * balances together, so all three cache groups are refreshed in one step.
 */
export async function invalidateAfterEscrowMutation(
  queryClient: QueryClient,
  { escrowId, deliveryId, shipmentId }: EscrowInvalidationTarget = {},
): Promise<void> {
  const escrowKeys: Array<readonly unknown[]> = escrowId
    ? [
        queryKeys.escrow.payout(escrowId),
        queryKeys.escrow.payoutFeeQuote(escrowId),
        queryKeys.escrow.settlement(escrowId),
      ]
    : [];
  await Promise.all([
    invalidateAll(queryClient, escrowKeys),
    invalidateDeliveryData(queryClient, { deliveryId, shipmentId }),
    invalidateWalletData(queryClient),
  ]);
}
