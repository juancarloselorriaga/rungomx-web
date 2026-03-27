import { DashboardPageIntro, DashboardPageIntroMeta } from '@/components/dashboard/page-intro';
import { ReactNode } from 'react';

type EventPaymentsHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  note: string;
  organizationName: string;
  actions?: ReactNode;
  organizationLabel?: string;
  scopeLabel?: string;
};

export function EventPaymentsHeader({
  eyebrow,
  title,
  description,
  note,
  organizationName,
  actions,
  organizationLabel,
  scopeLabel,
}: EventPaymentsHeaderProps) {
  return (
    <DashboardPageIntro
      title={title}
      description={description}
      eyebrow={eyebrow}
      actions={actions}
      aside={
        <DashboardPageIntroMeta
          eyebrow={organizationLabel ?? 'Selected organization'}
          title={organizationName}
          items={[{ label: scopeLabel ?? 'What happens here', value: note }]}
          className="bg-background/72"
        />
      }
    />
  );
}
