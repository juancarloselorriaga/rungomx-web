import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';
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
    <div className={cn('border-t border-border/70 pt-8 md:pt-10', className)} {...props}>
      <div className="max-w-[46rem]">
        {eyebrow ? (
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--brand-blue)]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-display mt-3 text-[clamp(1.8rem,3vw,2.6rem)] font-medium leading-[0.98] tracking-[-0.03em] text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-3 text-base leading-7 text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <div className="mt-10 border-t border-border/70">
        {links.map((link) => (
          <Link
            key={link.href.toString()}
            href={link.href}
            className="group grid gap-5 border-b border-border/70 py-7 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-6 md:py-8"
          >
            <div className="min-w-0">
              <h3 className="font-display text-[clamp(1.55rem,2.9vw,2rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
                {link.title}
              </h3>
              {link.description ? (
                <p className="mt-3 max-w-[44ch] text-sm leading-7 text-muted-foreground">
                  {link.description}
                </p>
              ) : null}
            </div>
            <span className="inline-flex items-center gap-2 self-start text-sm font-semibold text-foreground md:mt-2">
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
