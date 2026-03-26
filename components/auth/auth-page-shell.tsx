import { PublicStatusShell } from '@/components/common';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type AuthPageShellProps = {
  icon: ReactNode;
  title: string;
  description: string;
  eyebrow?: string;
  notice?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AuthPageShell({
  icon,
  title,
  description,
  eyebrow,
  notice,
  footer,
  children,
  className,
}: AuthPageShellProps) {
  return (
    <PublicStatusShell
      badge={eyebrow ?? 'RunGoMX'}
      icon={icon}
      title={title}
      description={description}
      className={className}
      introClassName="max-w-2xl"
      surfaceClassName="max-w-2xl"
      bodyClassName="space-y-6"
      support={notice}
    >
      <div className="space-y-6">{children}</div>
      {footer ? (
        <div className={cn('border-t border-border/60 pt-6', !children && 'pt-0')}>{footer}</div>
      ) : null}
    </PublicStatusShell>
  );
}
