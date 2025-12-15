'use client';

import type { AdminDashboardMetrics, DailyPoint } from '@/lib/admin-dashboard/metrics';
import { cn } from '@/lib/utils';
import type React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type AdminDashboardRangeOption,
  AdminDashboardRangeSelector,
  type AdminDashboardRangeValue,
} from './admin-dashboard-range-selector';

type MetricCardProps = {
  title: string;
  description: string;
  primaryValue: string;
  secondaryValue?: string;
  accentColorVariable: string;
  children: React.ReactNode;
  bodyMinHeight?: number;
};

function MetricCard({
  title,
  description,
  primaryValue,
  secondaryValue,
  accentColorVariable,
  children,
  bodyMinHeight,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col justify-between rounded-xl border bg-card/80 p-4 shadow-sm',
        'bg-gradient-to-b from-background-surface/80 to-background',
      )}
      style={{ borderColor: `var(${accentColorVariable})` }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium leading-tight">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{primaryValue}</div>
          {secondaryValue ? (
            <div className="mt-1 text-xs text-muted-foreground">{secondaryValue}</div>
          ) : null}
        </div>
      </div>
      <div
        className="mt-4"
        style={{ minHeight: typeof bodyMinHeight === 'number' ? bodyMinHeight : undefined }}
      >
        {children}
      </div>
    </div>
  );
}

type ChartProps = {
  data: DailyPoint[];
  colorVariable: string;
};

function TrendLineChart({ data, colorVariable }: ChartProps) {
  const stroke = `var(${colorVariable})`;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="rgba(148, 163, 184, 0.15)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={32}
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--background-surface)',
            borderRadius: '0.5rem',
            border: '1px solid var(--border)',
            padding: '0.5rem 0.75rem',
          }}
          labelStyle={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}
          itemStyle={{ fontSize: '0.75rem' }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export type AdminDashboardMetricsLabels = {
  sectionTitle: string;
  sectionDescription: string;
  users: {
    title: string;
    description: string;
    secondaryLabel: string;
  };
  profiles: {
    title: string;
    description: string;
    secondaryLabel: string;
  };
  contactSubmissions: {
    title: string;
    description: string;
    fallbackSecondaryLabel: string;
    originsPrefix: string;
  };
  registrationsByRole: {
    title: string;
    description: string;
    totalLabel: string;
    roleLabels: {
      organizer: string;
      athlete: string;
      volunteer: string;
    };
  };
  operations: {
    feedbackRateTitle: string;
    feedbackRateDescription: string;
    feedbackRateLabel: string;
    feedbackEntriesLabel: string;
    usersLabel: string;
  };
};

type AdminDashboardMetricsGridProps = {
  metrics: AdminDashboardMetrics;
  labels: AdminDashboardMetricsLabels;
  rangeOptions: AdminDashboardRangeOption[];
  selectedRange: AdminDashboardRangeValue;
};

export function AdminDashboardMetricsGrid({
  metrics,
  labels,
  rangeOptions,
  selectedRange,
}: AdminDashboardMetricsGridProps) {
  const topOrigins = metrics.contactSubmissions.topOrigins;
  const roleMetrics = metrics.registrationsByRole;
  const totalRoleAssignments = roleMetrics.totalAssignments;

  const feedbackRate =
    metrics.users.total > 0
      ? Math.round((metrics.contactSubmissions.total / metrics.users.total) * 1000) / 10
      : 0;

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold leading-tight">{labels.sectionTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.sectionDescription}</p>
        </div>
        <AdminDashboardRangeSelector options={rangeOptions} selected={selectedRange} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title={labels.users.title}
          description={labels.users.description}
          primaryValue={metrics.users.total.toLocaleString()}
          secondaryValue={labels.users.secondaryLabel}
          accentColorVariable="--color-chart-1"
          bodyMinHeight={160}
        >
          <TrendLineChart data={metrics.users.daily} colorVariable="--color-chart-1" />
        </MetricCard>

        <MetricCard
          title={labels.profiles.title}
          description={labels.profiles.description}
          primaryValue={metrics.profiles.total.toLocaleString()}
          secondaryValue={labels.profiles.secondaryLabel}
          accentColorVariable="--color-chart-2"
          bodyMinHeight={160}
        >
          <TrendLineChart data={metrics.profiles.daily} colorVariable="--color-chart-2" />
        </MetricCard>

        <MetricCard
          title={labels.contactSubmissions.title}
          description={labels.contactSubmissions.description}
          primaryValue={metrics.contactSubmissions.total.toLocaleString()}
          secondaryValue={
            metrics.contactSubmissions.total > 0 && topOrigins.length > 0
              ? `${labels.contactSubmissions.originsPrefix} ${topOrigins
                  .map((o) => o.origin)
                  .join(', ')}`
              : labels.contactSubmissions.fallbackSecondaryLabel
          }
          accentColorVariable="--color-chart-3"
          bodyMinHeight={160}
        >
          <TrendLineChart data={metrics.contactSubmissions.daily} colorVariable="--color-chart-3" />
        </MetricCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard
          title={labels.registrationsByRole.title}
          description={labels.registrationsByRole.description}
          primaryValue={totalRoleAssignments.toLocaleString()}
          secondaryValue={labels.registrationsByRole.totalLabel}
          accentColorVariable="--color-chart-4"
          bodyMinHeight={160}
        >
          <div className="flex h-full flex-col justify-between text-xs text-muted-foreground">
            {(['organizer', 'athlete', 'volunteer'] as const).map((kind) => {
              const label = labels.registrationsByRole.roleLabels[kind];
              const entry = roleMetrics.byKind.find((item) => item.kind === kind);
              const count = entry?.count ?? 0;
              const percent =
                totalRoleAssignments > 0 ? Math.round((count / totalRoleAssignments) * 100) : 0;

              return (
                <div key={kind} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{label}</span>
                    <span className="tabular-nums">
                      {count.toLocaleString()} {percent > 0 ? `· ${percent}%` : ''}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${percent}%`,
                        background:
                          kind === 'organizer'
                            ? 'var(--color-chart-4)'
                            : kind === 'athlete'
                              ? 'var(--color-chart-1)'
                              : 'var(--color-chart-2)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </MetricCard>

        <MetricCard
          title={labels.operations.feedbackRateTitle}
          description={labels.operations.feedbackRateDescription}
          primaryValue={`${feedbackRate.toLocaleString()}%`}
          secondaryValue={labels.operations.feedbackRateLabel}
          accentColorVariable="--color-chart-5"
          bodyMinHeight={160}
        >
          <div className="flex h-full flex-col justify-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>{labels.operations.feedbackEntriesLabel}</span>
              <span className="tabular-nums">{labels.operations.usersLabel}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(feedbackRate, 100)}%`,
                  background: 'var(--color-chart-5)',
                }}
              />
            </div>
          </div>
        </MetricCard>
      </div>
    </section>
  );
}
