import { DashboardPageIntro, DashboardPageIntroMeta } from '@/components/dashboard/page-intro';
import type { ReactNode } from 'react';

type SettingsPageIntroProps = {
  title: string;
  description: string;
  eyebrow: string;
  userName?: string | null;
  userEmail?: string | null;
  actions?: ReactNode;
  metaItems?: ReadonlyArray<{
    label: string;
    value: ReactNode;
  }>;
};

export function SettingsPageIntro({
  title,
  description,
  eyebrow,
  userName,
  userEmail,
  actions,
  metaItems,
}: SettingsPageIntroProps) {
  const metaTitle = userName || userEmail || title;
  const metaSubtitle = userName && userEmail ? userEmail : userName ? description : undefined;

  return (
    <DashboardPageIntro
      title={title}
      description={description}
      eyebrow={eyebrow}
      actions={actions}
      aside={
        <DashboardPageIntroMeta
          eyebrow={eyebrow}
          title={metaTitle}
          subtitle={metaSubtitle}
          items={metaItems}
          className="bg-background/72"
        />
      }
    />
  );
}
