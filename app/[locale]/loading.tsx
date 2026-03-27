import {
  DashboardPageIntroSkeleton,
  LoadingShell,
  LoadingStatGrid,
  LoadingSurface,
  LoadingTextBlock,
} from '@/components/dashboard/page-skeleton';

export default function Loading() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <LoadingShell className="w-full">
        <DashboardPageIntroSkeleton
          showEyebrow={false}
          showActions={false}
          showAside={false}
          descriptionWidths={['w-full', 'w-4/5']}
        />

        <LoadingSurface>
          <LoadingTextBlock lines={['w-40', 'w-full', 'w-11/12']} />
          <LoadingStatGrid count={3} columnsClassName="md:grid-cols-3" compact />
        </LoadingSurface>
      </LoadingShell>
    </div>
  );
}
