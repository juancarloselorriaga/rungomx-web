import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import * as React from 'react';

type LocalizedLinkHref = React.ComponentProps<typeof Link>['href'];

export interface FaqAccordionLink {
  href: LocalizedLinkHref;
  label: string;
}

export interface FaqAccordionItem {
  id: string;
  question: string;
  answerTitle?: string;
  paragraphs?: string[];
  bullets?: string[];
  links?: FaqAccordionLink[];
  defaultOpen?: boolean;
}

export interface FaqAccordionGroup {
  id: string;
  title: string;
  description?: string;
  items: FaqAccordionItem[];
}

export interface FaqAccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  groups: FaqAccordionGroup[];
}

export function FaqAccordion({ groups, className, ...props }: FaqAccordionProps) {
  return (
    <div className={cn('space-y-8', className)} {...props}>
      {groups.map((group) => (
        <section
          key={group.id}
          id={group.id}
          className="scroll-mt-28 rounded-3xl border border-border bg-card/80 p-6 md:p-8"
          aria-labelledby={`${group.id}-title`}
        >
          <div className="max-w-2xl">
            <h3
              id={`${group.id}-title`}
              className="text-2xl font-semibold tracking-tight text-foreground"
            >
              {group.title}
            </h3>
            {group.description ? (
              <p className="mt-3 text-base leading-7 text-muted-foreground">{group.description}</p>
            ) : null}
          </div>

          <div className="mt-6 space-y-4">
            {group.items.map((item) => (
              <details
                key={item.id}
                className="group rounded-2xl border border-border bg-background/90 p-5 open:bg-muted/20"
                open={item.defaultOpen}
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                  <span className="text-left text-base font-semibold leading-7 text-foreground md:text-lg">
                    {item.question}
                  </span>
                  <ChevronDown
                    className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>

                <div className="mt-4 space-y-4 border-t border-border pt-4 text-sm leading-7 text-muted-foreground md:text-base">
                  {item.answerTitle ? (
                    <p className="font-medium text-foreground">{item.answerTitle}</p>
                  ) : null}

                  {item.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}

                  {item.bullets && item.bullets.length > 0 ? (
                    <ul className="list-disc space-y-2 pl-5">
                      {item.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}

                  {item.links && item.links.length > 0 ? (
                    <div className="flex flex-wrap gap-3 pt-1">
                      {item.links.map((link) => (
                        <Link
                          key={`${item.id}-${link.href.toString()}`}
                          href={link.href}
                          className="text-sm font-medium text-[var(--brand-blue)] underline-offset-4 hover:underline"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
