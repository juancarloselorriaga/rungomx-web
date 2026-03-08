import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type AdminPaymentsNavItem = {
  id: string;
  label: string;
  description: string;
};

type AdminPaymentsWorkspaceShellProps = {
  items: AdminPaymentsNavItem[];
};

type AdminPaymentsSectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  tone?: 'default' | 'caution';
};

export function AdminPaymentsWorkspaceShell({ items }: AdminPaymentsWorkspaceShellProps) {
  return (
    <nav className="rounded-2xl border bg-card/70 p-3 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="rounded-xl border bg-background/80 px-4 py-3 text-left transition hover:border-primary/40 hover:bg-card"
          >
            <p className="text-sm font-semibold">{item.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
          </a>
        ))}
      </div>
    </nav>
  );
}

export function AdminPaymentsWorkspaceSection({
  id,
  eyebrow,
  title,
  description,
  children,
  tone = 'default',
}: AdminPaymentsSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-24 rounded-2xl border p-5 shadow-sm',
        tone === 'caution'
          ? 'border-amber-200/80 bg-amber-50/40'
          : 'bg-card/70',
      )}
    >
      <div className="space-y-1 border-b border-border/70 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
          {eyebrow}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="pt-5">{children}</div>
    </section>
  );
}
