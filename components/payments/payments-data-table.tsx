import { cn } from '@/lib/utils';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type PaymentsDataTableProps = ComponentPropsWithoutRef<'table'> & {
  minWidthClassName?: string;
  wrapperClassName?: string;
};

type Align = 'left' | 'right' | 'center';

function alignClassName(align: Align): string {
  switch (align) {
    case 'right':
      return 'text-right';
    case 'center':
      return 'text-center';
    default:
      return 'text-left';
  }
}

export function PaymentsDataTable({
  className,
  minWidthClassName,
  wrapperClassName,
  children,
  ...props
}: PaymentsDataTableProps) {
  return (
    <div
      className={cn(
        'mt-4 overflow-x-auto rounded-xl border border-border/60 bg-background/70 px-4 [scrollbar-gutter:stable]',
        wrapperClassName,
      )}
    >
      <table
        className={cn(
          'w-full border-separate border-spacing-0 text-sm',
          minWidthClassName,
          className,
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function PaymentsDataTableHead({
  className,
  ...props
}: ComponentPropsWithoutRef<'thead'>) {
  return (
    <thead
      className={cn(
        'text-left text-[11px] uppercase tracking-[0.16em] text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function PaymentsDataTableHeader({
  align = 'left',
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'th'> & { align?: Align; children: ReactNode }) {
  return (
    <th
      className={cn(
        'border-b border-border/70 pb-3 pt-3 pr-4 align-bottom font-medium whitespace-nowrap last:pr-0',
        alignClassName(align),
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function PaymentsDataTableRow({
  className,
  ...props
}: ComponentPropsWithoutRef<'tr'>) {
  return <tr className={cn('border-t border-border/60 align-top', className)} {...props} />;
}

export function PaymentsDataTableCell({
  align = 'left',
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'td'> & { align?: Align; children: ReactNode }) {
  return (
    <td
      className={cn(
        'py-3.5 pr-4 align-top last:pr-0',
        alignClassName(align),
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

export function PaymentsDataTableMeta({
  className,
  ...props
}: ComponentPropsWithoutRef<'p'>) {
  return <p className={cn('mt-1 text-xs text-muted-foreground', className)} {...props} />;
}

export function PaymentsResponsiveList({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('grid gap-3 md:hidden', className)} {...props} />;
}

export function PaymentsResponsiveListItem({
  className,
  ...props
}: ComponentPropsWithoutRef<'article'>) {
  return (
    <article
      className={cn(
        'rounded-xl border border-border/60 bg-background/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]',
        className,
      )}
      {...props}
    />
  );
}

export function PaymentsResponsiveListGrid({
  className,
  ...props
}: ComponentPropsWithoutRef<'dl'>) {
  return <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-3', className)} {...props} />;
}

export function PaymentsResponsiveListLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<'dt'>) {
  return (
    <dt
      className={cn(
        'text-[11px] uppercase tracking-[0.14em] text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function PaymentsResponsiveListValue({
  className,
  ...props
}: ComponentPropsWithoutRef<'dd'>) {
  return <dd className={cn('mt-1 text-sm text-foreground', className)} {...props} />;
}
