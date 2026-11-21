import { boundsKey, computeBounds, isValidCoordinate } from '@/lib/mapViewport';

describe('isValidCoordinate', () => {
  it('accepts finite in-range coordinates, including the equator/meridian', () => {
    expect(isValidCoordinate({ latitude: 6.5, longitude: 3.3 })).toBe(true);
    expect(isValidCoordinate({ latitude: 0, longitude: 0 })).toBe(true);
    expect(isValidCoordinate({ latitude: -90, longitude: 180 })).toBe(true);
  });

  it.each([
    [null],
    [undefined],
    [{ latitude: NaN, longitude: 1 }],
    [{ latitude: 1, longitude: Infinity }],
    [{ latitude: 91, longitude: 0 }],
    [{ latitude: 0, longitude: -181 }],
    [{ latitude: '6.5' as unknown as number, longitude: 3 }],
    [{ latitude: 6.5 }],
  ])('rejects %j', (value) => {
    expect(isValidCoordinate(value)).toBe(false);
  });
});

describe('computeBounds', () => {
  it('returns the bounding box of valid points', () => {
    expect(
      computeBounds([
        { latitude: 6.5, longitude: 3.3 },
        { latitude: 7.1, longitude: 2.9 },
        { latitude: 6.0, longitude: 4.2 },
      ]),
    ).toEqual({ north: 7.1, south: 6.0, east: 4.2, west: 2.9 });
  });

  it('ignores invalid entries', () => {
    expect(
      computeBounds([
        { latitude: 6.5, longitude: 3.3 },
        { latitude: NaN, longitude: 3.3 },
        null,
        undefined,
      ]),
    ).toEqual({ north: 6.5, south: 6.5, east: 3.3, west: 3.3 });
  });

  it('returns null when nothing is valid', () => {
    expect(computeBounds([])).toBeNull();
    expect(computeBounds([{ latitude: NaN, longitude: NaN }])).toBeNull();
  });
});

describe('boundsKey', () => {
  it('is stable for equal boxes and differs when the box changes', () => {
    const a = { north: 1, south: 0, east: 1, west: 0 };
    expect(boundsKey(a)).toBe(boundsKey({ ...a }));
    expect(boundsKey(a)).not.toBe(boundsKey({ ...a, north: 2 }));
    expect(boundsKey(null)).toBe('none');
  });
});
