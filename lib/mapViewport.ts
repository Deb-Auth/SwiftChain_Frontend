/**
 * Pure helpers for computing safe map viewports.
 *
 * Leaflet throws on non-finite coordinates ("Invalid LatLng object"), so every
 * coordinate coming from an API or socket is validated before it reaches the
 * map. Keeping this logic free of Leaflet imports makes it unit-testable.
 */

import type { Coordinate, MapBounds } from '@/types/tracking';

/** True when the value is a finite, in-range latitude/longitude pair. */
export function isValidCoordinate(
  coordinate: Partial<Coordinate> | null | undefined,
): coordinate is Coordinate {
  if (!coordinate) return false;
  const { latitude, longitude } = coordinate;
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

/**
 * Computes the bounding box of the valid coordinates in `coordinates`.
 * Invalid entries are ignored. Returns null when nothing valid remains, so
 * callers can skip `fitBounds` instead of passing it NaN/Infinity.
 */
export function computeBounds(
  coordinates: ReadonlyArray<Partial<Coordinate> | null | undefined>,
): MapBounds | null {
  const valid = coordinates.filter(isValidCoordinate);
  if (valid.length === 0) return null;

  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  for (const { latitude, longitude } of valid) {
    north = Math.max(north, latitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    west = Math.min(west, longitude);
  }
  return { north, south, east, west };
}

/**
 * Stable string identity for a bounds box. Used as an effect dependency so the
 * map is only re-fitted when the box actually changes, rather than on every
 * render that happens to allocate a new object.
 */
export function boundsKey(bounds: MapBounds | null): string {
  if (!bounds) return 'none';
  return [bounds.north, bounds.south, bounds.east, bounds.west]
    .map((n) => n.toFixed(6))
    .join('|');
}
