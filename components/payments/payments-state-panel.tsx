import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { PaymentsPanel } from './payments-surfaces';

type PaymentsStatePanelProps = {
  title: string;
  description: string;
  eyebrow?: string;
  tone?: 'neutral' | 'warning' | 'error';
  dashed?: boolean;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
};

const toneClasses: Record<NonNullable<PaymentsStatePanelProps['tone']>, string> = {
  neutral: 'bg-card/80',
  warning: 'border-amber-200/60 bg-amber-50/50 dark:bg-amber-950/20',
  error: 'border-destructive/25 bg-destructive/5',
};

export function PaymentsStatePanel({
  title,
  description,
  eyebrow,
  tone = 'neutral',
  dashed = false,
  action,
  children,
  className,
}: PaymentsStatePanelProps) {
  return (
    <PaymentsPanel
      className={cn(toneClasses[tone], dashed ? 'border-dashed' : 'border', className)}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="sm:flex-none">{action}</div> : null}
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
    </PaymentsPanel>
  );
}
