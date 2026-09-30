'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { driverReviewService } from '@/services/driverReviewService';
import type { DriverReview, DriverReviewFilters } from '@/types/driverReview';

export const REVIEWS_PAGE_SIZE = 6;

export interface UseDriverReviewsResult {
  reviews: DriverReview[];
  isLoading: boolean;
  error: string | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}

/**
 * useDriverReviews - paginated (load more) driver reviews with server-side
 * filtering and sorting. Components consume this hook, never the service.
 */
export function useDriverReviews(
  driverId: string,
  filters: DriverReviewFilters,
): UseDriverReviewsResult {
  const query = useInfiniteQuery({
    queryKey: ['driver-reviews', driverId, filters],
    queryFn: ({ pageParam, signal }) =>
      driverReviewService.getDriverReviews(
        driverId,
        { ...filters, page: pageParam, pageSize: REVIEWS_PAGE_SIZE },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: Boolean(driverId),
  });

  return {
    reviews: query.data?.pages.flatMap((p) => p.reviews) ?? [],
    isLoading: query.isLoading,
    error: query.error
      ? query.error instanceof Error && query.error.message
        ? query.error.message
        : 'Failed to load reviews'
      : null,
    hasNextPage: Boolean(query.hasNextPage),
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    refetch: () => {
      void query.refetch();
    },
  };
}
