import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useDriverReviews, REVIEWS_PAGE_SIZE } from '@/hooks/useDriverReviews';
import { driverReviewService } from '@/services/driverReviewService';
import { DEFAULT_REVIEW_FILTERS } from '@/components/fleet/ReputationReviewGrid';
import { buildReviewsPage, driverReviewFixtures } from '../fixtures/driverReviewFixtures';

jest.mock('@/services/driverReviewService', () => ({
  driverReviewService: { getDriverReviews: jest.fn() },
}));

const getReviews = driverReviewService.getDriverReviews as jest.Mock;

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }) },
    children,
  );

beforeEach(() => jest.clearAllMocks());

describe('useDriverReviews', () => {
  it('fetches the first page through the service with filters and page size', async () => {
    getReviews.mockResolvedValueOnce(buildReviewsPage(driverReviewFixtures.slice(0, 3), 1, false));
    const { result } = renderHook(() => useDriverReviews('driver-1', DEFAULT_REVIEW_FILTERS), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getReviews).toHaveBeenCalledWith(
      'driver-1',
      { ...DEFAULT_REVIEW_FILTERS, page: 1, pageSize: REVIEWS_PAGE_SIZE },
      expect.anything(),
    );
    expect(result.current.reviews).toHaveLength(3);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('appends the next page when fetchNextPage is called', async () => {
    getReviews
      .mockResolvedValueOnce(buildReviewsPage(driverReviewFixtures.slice(0, 3), 1, true))
      .mockResolvedValueOnce(buildReviewsPage(driverReviewFixtures.slice(3), 2, false));
    const { result } = renderHook(() => useDriverReviews('driver-1', DEFAULT_REVIEW_FILTERS), { wrapper });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.reviews).toHaveLength(driverReviewFixtures.length));
    expect(getReviews).toHaveBeenLastCalledWith(
      'driver-1',
      expect.objectContaining({ page: 2 }),
      expect.anything(),
    );
    expect(result.current.hasNextPage).toBe(false);
  });

  it('exposes a message when the service fails', async () => {
    getReviews.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useDriverReviews('driver-1', DEFAULT_REVIEW_FILTERS), { wrapper });
    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.reviews).toEqual([]);
  });

  it('does not fetch without a driverId', () => {
    renderHook(() => useDriverReviews('', DEFAULT_REVIEW_FILTERS), { wrapper });
    expect(getReviews).not.toHaveBeenCalled();
  });
});
