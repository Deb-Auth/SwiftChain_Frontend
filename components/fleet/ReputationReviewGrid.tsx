'use client';

import { useState } from 'react';
import { StarIcon, ShieldCheckIcon } from '@heroicons/react/24/solid';
import { useDriverReviews } from '@/hooks/useDriverReviews';
import type {
  DriverReviewFilters,
  ReviewDateRange,
  ReviewSort,
} from '@/types/driverReview';

export const DEFAULT_REVIEW_FILTERS: DriverReviewFilters = {
  minRating: null,
  dateRange: 'all',
  verifiedOnly: false,
  sort: 'date_desc',
};

interface ReputationReviewGridProps {
  driverId: string;
}

export function ReputationReviewGrid({ driverId }: ReputationReviewGridProps) {
  const [filters, setFilters] = useState<DriverReviewFilters>(DEFAULT_REVIEW_FILTERS);
  const { reviews, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } =
    useDriverReviews(driverId, filters);

  const selectClass =
    'rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800';

  return (
    <section aria-label="Driver reviews" className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="review-rating" className="text-xs font-medium text-gray-600">
            Minimum rating
          </label>
          <select
            id="review-rating"
            className={selectClass}
            value={filters.minRating ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                minRating: e.target.value ? Number(e.target.value) : null,
              }))
            }
          >
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n}+ stars
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="review-date" className="text-xs font-medium text-gray-600">
            Date range
          </label>
          <select
            id="review-date"
            className={selectClass}
            value={filters.dateRange}
            onChange={(e) =>
              setFilters((f) => ({ ...f, dateRange: e.target.value as ReviewDateRange }))
            }
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="review-sort" className="text-xs font-medium text-gray-600">
            Sort by
          </label>
          <select
            id="review-sort"
            className={selectClass}
            value={filters.sort}
            onChange={(e) =>
              setFilters((f) => ({ ...f, sort: e.target.value as ReviewSort }))
            }
          >
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="rating_desc">Highest rating</option>
            <option value="rating_asc">Lowest rating</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={filters.verifiedOnly}
            onChange={(e) => setFilters((f) => ({ ...f, verifiedOnly: e.target.checked }))}
          />
          Verified only
        </label>
      </div>

      {isLoading ? (
        <p role="status" className="text-sm text-gray-500">
          Loading reviews...
        </p>
      ) : error ? (
        <div role="alert" className="space-y-2 text-sm text-red-600">
          <p>{error}</p>
          <button
            type="button"
            onClick={refetch}
            className="rounded-md border border-red-300 px-3 py-1 text-red-700"
          >
            Retry
          </button>
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-gray-500">No reviews match your filters.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review) => (
            <article
              key={review.id}
              className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">{review.reviewerName}</h3>
                <span
                  className="flex items-center gap-1 text-sm text-amber-600"
                  aria-label={`Rated ${review.rating} out of 5`}
                >
                  <StarIcon className="h-4 w-4" aria-hidden="true" />
                  {review.rating}
                </span>
              </div>
              <p className="text-sm text-gray-700">{review.comment}</p>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <time dateTime={review.createdAt}>
                  {new Date(review.createdAt).toLocaleDateString('en-US')}
                </time>
                {review.verified && (
                  <span className="flex items-center gap-1 text-blue-700">
                    <ShieldCheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    Verified
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {hasNextPage && !isLoading && !error && (
        <button
          type="button"
          onClick={fetchNextPage}
          disabled={isFetchingNextPage}
          className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading more...' : 'Load more'}
        </button>
      )}
    </section>
  );
}
