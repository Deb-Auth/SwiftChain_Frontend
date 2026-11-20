/**
 * Central registry of TanStack Query keys for delivery, shipment, escrow and
 * wallet data. Key values match the literals already used across the app so
 * existing queries keep their cache entries.
 */
export const queryKeys = {
  deliveries: {
    all: ['deliveries'] as const,
    detail: (id: string) => ['delivery', id] as const,
    statusTimeline: (id: string) => ['statusTimeline', id] as const,
    milestoneTimeline: (id: string) => ['milestoneTimeline', id] as const,
    handoffQR: (id: string) => ['handoffQR', id] as const,
  },
  shipments: {
    all: ['shipments'] as const,
    detail: (id: string) => ['shipment', id] as const,
  },
  escrow: {
    payout: (escrowId: string) => ['escrowPayout', escrowId] as const,
    payoutFeeQuote: (escrowId: string) => ['escrowPayoutFeeQuote', escrowId] as const,
    settlement: (escrowId: string) => ['settlementBreakdown', escrowId] as const,
  },
  wallet: {
    all: ['wallet'] as const,
    driverEarnings: ['driverEarnings'] as const,
    transactions: ['transaction'] as const,
  },
} as const;
