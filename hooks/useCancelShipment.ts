'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invalidateDeliveryData, invalidateWalletData } from '@/lib/cacheInvalidation';
import { queryKeys } from '@/lib/queryKeys';
import {
  shipmentService,
  type Shipment,
} from '@/services/shipmentService';

/**
 * Cache key factory for shipment queries.
 * Exported so components/tests can invalidate or seed the same key.
 */
export const shipmentQueryKey = (id: string) => queryKeys.shipments.detail(id);

interface UseCancelShipmentResult {
  shipment: Shipment | undefined;
  isLoadingShipment: boolean;
  isShipmentError: boolean;
  /**
   * True only when the shipment is still `pending` AND no driver has
   * been assigned. The component uses this to decide whether to render
   * the "Cancel Request" button.
   */
  canCancel: boolean;
  cancel: () => void;
  isCancelling: boolean;
  cancelError: Error | null;
}

/**
 * useCancelShipment — encapsulates all data + mutation logic for the
 * shipment cancellation flow.
 *
 * Strict layered architecture:
 *   Component (CancelShipment) → Hook (useCancelShipment) → Service (shipmentService)
 *
 * - Reads shipment from the backend via React Query.
 * - Exposes `canCancel` so the component never re-implements the rule.
 * - Mutates with `shipmentService.cancelShipment` and invalidates the
 *   shipment cache on success so any consumer re-fetches fresh state.
 * - Surfaces UX feedback through Sonner toasts, with an explicit
 *   reminder about escrow refund timing.
 */
export function useCancelShipment(shipmentId: string): UseCancelShipmentResult {
  const queryClient = useQueryClient();

  const shipmentQuery = useQuery({
    queryKey: shipmentQueryKey(shipmentId),
    queryFn: () => shipmentService.getShipment(shipmentId),
    enabled: Boolean(shipmentId),
    retry: 1,
  });

  const cancelMutation = useMutation({
    mutationFn: () => shipmentService.cancelShipment(shipmentId),
    onSuccess: (response) => {
      toast.success(
        response.message ||
          'Shipment cancelled. Escrow refund is being processed and may take a few minutes to reflect.'
      );
      // A cancellation refunds escrow, so wallet balances are stale too.
      void invalidateDeliveryData(queryClient, { shipmentId });
      void invalidateWalletData(queryClient);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } }; message?: string })
          ?.response?.data?.message ||
        (error as Error)?.message ||
        'Failed to cancel shipment. Please try again.';
      toast.error(message);
    },
  });

  const shipment = shipmentQuery.data;
  const canCancel = Boolean(
    shipment && shipment.status === 'pending' && !shipment.driverId
  );

  return {
    shipment,
    isLoadingShipment: shipmentQuery.isLoading,
    isShipmentError: shipmentQuery.isError,
    canCancel,
    cancel: () => cancelMutation.mutate(),
    isCancelling: cancelMutation.isPending,
    cancelError: (cancelMutation.error as Error | null) ?? null,
  };
}
