/**
 * TrackingMap viewport bounds, loading guards and state cleanup.
 *
 * Exercises the real component with Leaflet mocked, focusing on the failure
 * modes that used to crash or mislead: invalid coordinates, a failed live poll
 * discarding a loaded route, and the viewport being reset on every location
 * tick.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TrackingMap } from '@/components/shipments/TrackingMap';
import { useTrackingRoute } from '@/hooks/useTrackingRoute';
import type { RouteData } from '@/types/tracking';

const mockFitBounds = jest.fn();

jest.mock('@/hooks/useTrackingRoute');
const mockUseTrackingRoute = useTrackingRoute as jest.MockedFunction<
  typeof useTrackingRoute
>;

jest.mock('leaflet/dist/leaflet.css', () => ({}));

jest.mock('leaflet', () => ({
  __esModule: true,
  default: {
    icon: jest.fn((opts) => opts),
    Icon: { Default: { prototype: {} } },
    latLngBounds: jest.fn((sw, ne) => ({ sw, ne })),
  },
}));

jest.mock('react-leaflet', () => {
  const ReactLib = require('react');
  const passthrough =
    (testId: string) =>
    ({ children, position }: { children?: React.ReactNode; position?: number[] }) =>
      ReactLib.createElement(
        'div',
        { 'data-testid': testId, 'data-position': position?.join(',') },
        children,
      );
  // Real Leaflet returns one stable map instance; mirror that so effects keyed
  // on the map do not re-run every render.
  const stableMap = { fitBounds: (...args: unknown[]) => mockFitBounds(...args) };
  return {
    __esModule: true,
    MapContainer: passthrough('map-container'),
    TileLayer: () => null,
    Marker: passthrough('map-marker'),
    Popup: passthrough('map-popup'),
    Polyline: ({ positions }: { positions: number[][] }) =>
      ReactLib.createElement('div', {
        'data-testid': 'polyline',
        'data-positions': positions.map((p) => p.join(',')).join(';'),
      }),
    useMap: () => stableMap,
  };
});

const route = (overrides: Partial<RouteData> = {}): RouteData => ({
  deliveryId: 'd-1',
  origin: { latitude: 6.5, longitude: 3.3 },
  destination: { latitude: 6.7, longitude: 3.5 },
  waypoints: [
    { coordinate: { latitude: 6.5, longitude: 3.3 }, type: 'origin' },
    { coordinate: { latitude: 6.6, longitude: 3.4 }, type: 'checkpoint', label: 'Hub' },
    { coordinate: { latitude: 6.7, longitude: 3.5 }, type: 'destination' },
  ],
  status: 'in_transit',
  timestamp: '2026-10-19T08:00:00.000Z',
  ...overrides,
});

const state = (
  overrides: Partial<ReturnType<typeof useTrackingRoute>> = {},
): ReturnType<typeof useTrackingRoute> => ({
  routeData: route(),
  currentLocation: { latitude: 6.55, longitude: 3.35 },
  isLoading: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
  ...overrides,
});

describe('TrackingMap guards', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not render the map while loading', () => {
    mockUseTrackingRoute.mockReturnValue(state({ routeData: null, isLoading: true }));
    render(<TrackingMap deliveryId="d-1" />);
    expect(screen.getByText('Loading map...')).toBeInTheDocument();
    expect(screen.queryByTestId('map-container')).not.toBeInTheDocument();
  });

  it('shows a fallback instead of crashing when route endpoints are invalid', () => {
    mockUseTrackingRoute.mockReturnValue(
      state({
        routeData: route({ origin: { latitude: NaN, longitude: 3.3 } }),
        currentLocation: null,
      }),
    );
    render(<TrackingMap deliveryId="d-1" />);
    expect(screen.getByText('Route coordinates are unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('map-container')).not.toBeInTheDocument();
  });

  it('skips waypoints with invalid coordinates in the polyline and markers', () => {
    mockUseTrackingRoute.mockReturnValue(
      state({
        routeData: route({
          waypoints: [
            { coordinate: { latitude: 6.5, longitude: 3.3 }, type: 'origin' },
            { coordinate: { latitude: 999, longitude: 3.4 }, type: 'checkpoint', label: 'Bad' },
            { coordinate: { latitude: 6.7, longitude: 3.5 }, type: 'destination' },
          ],
        }),
      }),
    );
    render(<TrackingMap deliveryId="d-1" />);
    expect(screen.getByTestId('polyline')).toHaveAttribute(
      'data-positions',
      '6.5,3.3;6.7,3.5',
    );
    expect(screen.queryByText('Bad')).not.toBeInTheDocument();
  });

  it('ignores an invalid live location instead of rendering a marker', () => {
    mockUseTrackingRoute.mockReturnValue(
      state({ currentLocation: { latitude: NaN, longitude: NaN } }),
    );
    render(<TrackingMap deliveryId="d-1" />);
    expect(screen.queryByText('Current Location')).not.toBeInTheDocument();
  });

  it('keeps the loaded route visible when only live polling fails', () => {
    mockUseTrackingRoute.mockReturnValue(
      state({ isError: true, error: 'Location service down', currentLocation: null }),
    );
    render(<TrackingMap deliveryId="d-1" />);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByTestId('tracking-live-warning')).toHaveTextContent(
      'Location service down',
    );
  });

  it('shows the blocking error state when there is no route at all', () => {
    mockUseTrackingRoute.mockReturnValue(
      state({ routeData: null, isError: true, error: 'Not found', currentLocation: null }),
    );
    render(<TrackingMap deliveryId="d-1" />);
    expect(screen.getByText('Not found')).toBeInTheDocument();
    expect(screen.queryByTestId('map-container')).not.toBeInTheDocument();
  });

  it('does not re-fit the viewport when only the live location changes', () => {
    mockUseTrackingRoute.mockReturnValue(state());
    const { rerender } = render(<TrackingMap deliveryId="d-1" />);
    expect(mockFitBounds).toHaveBeenCalledTimes(1);

    mockUseTrackingRoute.mockReturnValue(
      state({ currentLocation: { latitude: 6.58, longitude: 3.38 } }),
    );
    rerender(<TrackingMap deliveryId="d-1" />);
    mockUseTrackingRoute.mockReturnValue(
      state({ currentLocation: { latitude: 6.61, longitude: 3.41 } }),
    );
    rerender(<TrackingMap deliveryId="d-1" />);

    expect(mockFitBounds).toHaveBeenCalledTimes(1);
  });

  it('re-fits the viewport when the route itself changes', () => {
    mockUseTrackingRoute.mockReturnValue(state());
    const { rerender } = render(<TrackingMap deliveryId="d-1" />);

    mockUseTrackingRoute.mockReturnValue(
      state({ routeData: route({ destination: { latitude: 7.5, longitude: 4.5 } }) }),
    );
    rerender(<TrackingMap deliveryId="d-1" />);

    expect(mockFitBounds).toHaveBeenCalledTimes(2);
  });

  it('reports hook errors through onMapError', () => {
    const onMapError = jest.fn();
    mockUseTrackingRoute.mockReturnValue(
      state({ routeData: null, isError: true, error: 'boom', currentLocation: null }),
    );
    render(<TrackingMap deliveryId="d-1" onMapError={onMapError} />);
    expect(onMapError).toHaveBeenCalledWith('boom');
  });
});
