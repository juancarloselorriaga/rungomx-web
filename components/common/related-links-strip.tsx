import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { ArrowUpRight } from 'lucide-react';
import * as React from 'react';

type LocalizedLinkHref = React.ComponentProps<typeof Link>['href'];

export interface RelatedLinksStripItem {
  href: LocalizedLinkHref;
  title: string;
  description?: string;
}

export interface RelatedLinksStripProps extends React.HTMLAttributes<HTMLDivElement> {
  eyebrow?: string;
  title: string;
  description?: string;
  links: RelatedLinksStripItem[];
}

export function RelatedLinksStrip({
  eyebrow,
  title,
  description,
  links,
  className,
  ...props
}: RelatedLinksStripProps) {
  return (
    <div
      className={cn('rounded-3xl border border-border bg-muted/30 p-6 md:p-8', className)}
      {...props}
    >
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--brand-blue)]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-3 text-base leading-7 text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.href.toString()}
            href={link.href}
            className="group rounded-2xl border border-border bg-background p-5 transition-colors hover:border-[var(--brand-blue)]/40 hover:bg-card"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground transition-colors group-hover:text-[var(--brand-blue)]">
                  {link.title}
                </h3>
                {link.description ? (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{link.description}</p>
                ) : null}
              </div>
              <ArrowUpRight className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--brand-blue)]" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
