# Analytics instrumentation

`lib/analytics.ts` is the single entry point for product and operational events.

```ts
import { track } from '@/lib/analytics';

track('bid_submitted', { contractId });
```

## Event catalog

Events and their properties are declared in `AnalyticsEventMap`; adding an event
means adding it there, so call sites are type-checked.

| Event | Fired from | Properties |
| --- | --- | --- |
| `delivery_request_created` | `useCreateDelivery` (on success) | `packageSize` |
| `bid_submitted` | `useBidding` (on success) | `contractId` |
| `escrow_release_succeeded` / `escrow_release_failed` | `useEscrowRelease` | `escrowId`, `deliveryId` |
| `api_request_failed` | `lib/httpClient` response interceptor | `method`, `path` (ids masked, no query), `status` or `network_error` |
| `tracking_connection_changed` | `driverTrackingService` (once per transition) | `status` |

## Privacy

- Properties must be opaque ids or coarse values. Never pass emails, phone
  numbers, addresses, wallet addresses, tokens, names or amounts.
- As a second line of defence, property keys that look like PII are removed
  before dispatch.
- Nothing is sent when the browser has Do Not Track enabled.
- The session id is random per page load and is never persisted.

## Delivery

- Set `NEXT_PUBLIC_ANALYTICS_ENDPOINT` to POST each event as JSON (via
  `sendBeacon`, falling back to `fetch` with `keepalive`). The endpoint must
  accept cross-origin `application/json` requests.
- To forward events to another provider, call `registerAnalyticsSink(fn)`.
- With no endpoint and no sink, `track` is a no-op (in development it logs to
  the console).
- `track` never throws and does nothing on the server.
