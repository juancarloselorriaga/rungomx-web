import { cn } from '@/lib/utils';
import * as React from 'react';

export interface ListColumn {
  title: string;
  items: string[];
  variant?: 'green' | 'blue' | 'indigo';
  icon?: 'check' | 'dot' | 'arrow';
}

export interface IconListGridProps {
  title?: string;
  subtitle?: string;
  columns: ListColumn[];
  tagline?: string;
  className?: string;
}

const variantClasses = {
  green: {
    bg: 'bg-gradient-to-br from-[var(--brand-green)]/10 to-[var(--brand-green)]/5',
    ring: 'ring-1 ring-[var(--brand-green)]/20',
    icon: 'text-[var(--brand-green)]',
  },
  blue: {
    bg: 'bg-gradient-to-br from-[var(--brand-blue)]/10 to-[var(--brand-indigo)]/5',
    ring: 'ring-1 ring-[var(--brand-blue)]/20',
    icon: 'text-[var(--brand-blue)]',
  },
  indigo: {
    bg: 'bg-gradient-to-br from-[var(--brand-indigo)]/10 to-[var(--brand-blue)]/5',
    ring: 'ring-1 ring-[var(--brand-indigo)]/20',
    icon: 'text-[var(--brand-indigo)]',
  },
};

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-5 w-5 flex-shrink-0', className)} fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function IconListGrid({ title, subtitle, columns, tagline, className }: IconListGridProps) {
  return (
    <div className={cn('w-full', className)}>
      {title && <h2 className="mb-12 text-center text-3xl font-bold text-foreground">{title}</h2>}
      {subtitle && <p className="mb-12 text-center text-xl text-muted-foreground">{subtitle}</p>}

      <div className="grid gap-8 lg:grid-cols-2">
        {columns.map((column, index) => {
          const variant = column.variant || 'blue';
          const styles = variantClasses[variant];

          return (
            <div key={index} className={cn('rounded-2xl p-8 shadow-lg', styles.bg, styles.ring)}>
              <h3 className="mb-6 text-2xl font-bold text-foreground">{column.title}</h3>
              <ul className="space-y-4">
                {column.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="flex items-start space-x-3">
                    {column.icon === 'dot' ? (
                      <span
                        className={cn('mt-2 h-2 w-2 flex-shrink-0 rounded-full', styles.icon)}
                      />
                    ) : (
                      <CheckIcon className={cn('mt-1', styles.icon)} />
                    )}
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {tagline && (
        <div className="mt-8 text-center">
          <p className="text-xl font-semibold text-foreground">{tagline}</p>
        </div>
      )}
    </div>
  );
}
