import { DashboardPageIntro, DashboardPageIntroMeta } from '@/components/dashboard/page-intro';
import type { ReactNode } from 'react';

type EventPageIntroProps = {
  title: string;
  description: string;
  eventName: string;
  organizationName: string;
  eyebrow?: string;
  actions?: ReactNode;
  details?: Array<{
    label: string;
    value: ReactNode;
  }>;
};

export function EventPageIntro({
  title,
  description,
  eventName,
  organizationName,
  eyebrow,
  actions,
  details,
}: EventPageIntroProps) {
  return (
    <DashboardPageIntro
      title={title}
      description={description}
      actions={actions}
      aside={
        <DashboardPageIntroMeta
          eyebrow={eyebrow}
          title={eventName}
          subtitle={organizationName}
          items={details}
        />
      }
    />
  );
}
