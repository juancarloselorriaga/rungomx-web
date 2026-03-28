import { DashboardPageIntro, DashboardPageIntroMeta } from '@/components/dashboard/page-intro';
import type { ReactNode } from 'react';

type ResultsPageHeroProps = {
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
  eyebrow,
  title,
  description,
  stats,
  actions,
}: ResultsPageHeroProps) {
  return (
    <DashboardPageIntro
      eyebrow={eyebrow}
      title={title}
      description={description}
      actions={actions}
      aside={<DashboardPageIntroMeta title={title} items={stats} className="bg-background/72" />}
    />
  );
}
