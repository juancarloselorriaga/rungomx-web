import { DashboardPageIntro, DashboardPageIntroMeta } from '@/components/dashboard/page-intro';
import type { ReactNode } from 'react';

type ResultsPageHeroProps = {
  backLink?: ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
  stats: ReadonlyArray<{
    label: string;
    value: ReactNode;
  }>;
  actions?: ReactNode;
};

export function ResultsPageHero({
  backLink,
  eyebrow,
  title,
  description,
  stats,
  actions,
}: ResultsPageHeroProps) {
  return (
    <div className="space-y-4">
      {backLink ? backLink : null}
      <DashboardPageIntro
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
        aside={<DashboardPageIntroMeta title={title} items={stats} className="bg-background/72" />}
      />
    </div>
  );
}
