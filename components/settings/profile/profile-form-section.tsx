import { SettingsSurface } from '@/components/settings/settings-surface';
import type { ReactNode } from 'react';

type ProfileFormSectionProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function ProfileFormSection({ title, description, children }: ProfileFormSectionProps) {
  return (
    <SettingsSurface title={title} description={description} contentClassName="space-y-0">
      {children}
    </SettingsSurface>
  );
}
