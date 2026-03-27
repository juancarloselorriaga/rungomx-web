import { DashboardPageIntro, DashboardPageIntroMeta } from '@/components/dashboard/page-intro';
import type { ReactNode } from 'react';

type ResultsPageHeroProps = {
  title: string;
  description: string;
  stats: ReadonlyArray<{
    label: string;
    value: ReactNode;
  }>;
  actions?: ReactNode;
};

export function ResultsPageHero({ title, description, stats, actions }: ResultsPageHeroProps) {
  return (
    <DashboardPageIntro
      title={title}
      description={description}
      actions={actions}
      aside={<DashboardPageIntroMeta title={title} items={stats} className="bg-background/72" />}
    />
  );
}
