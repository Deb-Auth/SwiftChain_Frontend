'use client';

import { usePerformanceMetrics, type PerformanceMetricsParams } from '@/hooks/usePerformanceMetrics';

export interface PerformanceMetricsDashboardProps {
  params?: PerformanceMetricsParams;
}

export function PerformanceMetricsDashboard({ params }: PerformanceMetricsDashboardProps) {
  const { metrics, isLoading, isError, error, refetch } = usePerformanceMetrics(params);

  if (isLoading) return <p role="status" aria-live="polite">Loading performance metrics…</p>;
  if (isError) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p>Unable to load performance metrics{error?.message ? `: ${error.message}` : '.'}</p>
        <button type="button" onClick={() => void refetch()} className="mt-3 underline">Retry</button>
      </div>
    );
  }
  if (!metrics) return <p>No performance metrics available.</p>;

  return (
    <section aria-labelledby="performance-dashboard-title" className="space-y-6">
      <header>
        <h2 id="performance-dashboard-title" className="text-2xl font-semibold">Performance metrics</h2>
        <p className="text-sm text-slate-600">Monitor delivery speed, completion, volume, and driver performance.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3" aria-label="Performance KPI summary">
        <MetricCard label="Total deliveries" value={metrics.totalDeliveries.toLocaleString()} />
        <MetricCard label="Completion rate" value={`${metrics.completionRate.toFixed(1)}%`} />
        <MetricCard label="Average delivery time" value={`${metrics.averageDeliveryMinutes.toFixed(0)} min`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Widget title="Delivery times" id="performance-delivery-times">
          <ul className="space-y-2" aria-label="Delivery time trend">
            {metrics.deliveryTimes.map((point) => <li key={point.date} className="flex justify-between"><span>{point.date}</span><span>{point.averageMinutes} min</span></li>)}
          </ul>
        </Widget>
        <Widget title="Completion rates" id="performance-completion-rates">
          <ul className="space-y-2" aria-label="Completion rate trend">
            {metrics.completionRates.map((point) => <li key={point.date} className="flex justify-between"><span>{point.date}</span><strong>{point.rate.toFixed(1)}%</strong></li>)}
          </ul>
        </Widget>
        <Widget title="Regional volume" id="performance-regional-volume">
          <ul className="space-y-2" aria-label="Regional delivery volume">
            {metrics.regionalVolume.map((region) => <li key={region.region} className="flex justify-between"><span>{region.region}</span><span>{region.volume.toLocaleString()} ({region.percentage.toFixed(1)}%)</span></li>)}
          </ul>
        </Widget>
      </div>

      <Widget title="Driver rankings" id="performance-driver-rankings">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Driver performance rankings</caption>
            <thead><tr><th scope="col" className="pr-4">Driver</th><th scope="col" className="pr-4">Deliveries</th><th scope="col">Score</th></tr></thead>
            <tbody>{metrics.driverRankings.map((driver, index) => <tr key={driver.driverId} className="border-t border-slate-100"><th scope="row" className="py-2 pr-4 font-medium">{index + 1}. {driver.driverName}</th><td className="py-2 pr-4">{driver.deliveries}</td><td className="py-2">{driver.score.toFixed(1)}</td></tr>)}</tbody>
          </table>
        </div>
      </Widget>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4"><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 text-xl font-semibold">{value}</dd></div>;
}

function Widget({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return <section aria-labelledby={id} className="rounded-lg border border-slate-200 bg-white p-5"><h3 id={id} className="mb-4 text-lg font-medium">{title}</h3>{children}</section>;
}
