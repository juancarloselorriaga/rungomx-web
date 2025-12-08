'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { SettingsSection } from './types';

type SettingsNavProps = {
  title: string;
  description?: string;
  sections: SettingsSection[];
};

export function SettingsNav({ title, description, sections }: SettingsNavProps) {
  const pathname = usePathname();

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        {sections.map((section) => {
          const isActive =
            pathname === section.href || pathname?.startsWith(`${section.href}/`);

          return (
            <Link
              key={section.key}
              href={section.href as Parameters<typeof Link>[0]['href']}
              className={cn(
                'block rounded-md border px-3 py-2 transition',
                'hover:border-primary/60 hover:bg-muted/60',
                isActive
                  ? 'border-primary/70 bg-primary/5 text-foreground'
                  : 'border-border text-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <p className="text-sm font-medium leading-tight">{section.title}</p>
              {section.description ? (
                <p className="text-xs text-muted-foreground">{section.description}</p>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
