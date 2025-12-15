import type { ReactNode } from 'react';
import { SettingsNav } from './settings-nav';
import type { SettingsSection } from './types';

type SettingsShellProps = {
  title: string;
  description?: string;
  sections: SettingsSection[];
  children: ReactNode;
};

export function SettingsShell({ title, description, sections, children }: SettingsShellProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
      <aside className="self-start">
        <SettingsNav title={title} description={description} sections={sections} />
      </aside>

      <div className="space-y-6">{children}</div>
    </div>
  );
}
