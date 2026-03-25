import { ReactNode } from 'react';

type EventPaymentsHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  note: string;
  organizationName: string;
  actions?: ReactNode;
  organizationLabel?: string;
  scopeLabel?: string;
};

export function EventPaymentsHeader({
  eyebrow,
  title,
  description,
  note,
  organizationName,
  actions,
  organizationLabel,
  scopeLabel,
}: EventPaymentsHeaderProps) {
  return (
    <section className="rounded-xl border bg-card/80 p-4 shadow-sm sm:p-5">
      <div className="space-y-4 sm:space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
              {eyebrow}
            </p>
            <div className="space-y-2.5">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
              <p className="max-w-2xl text-sm leading-5 text-muted-foreground sm:leading-6">{description}</p>
            </div>
          </div>

          {actions ? <div className="flex shrink-0 items-start pt-1 max-md:w-full max-md:[&_button]:w-full">{actions}</div> : null}
        </div>

        <dl className="grid gap-3 rounded-lg border bg-background/70 p-4 md:grid-cols-[minmax(12rem,0.75fr)_minmax(0,1.25fr)]">
          <div className="space-y-1">
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {organizationLabel ?? 'Selected organization'}
            </dt>
            <dd className="text-sm font-medium">{organizationName}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {scopeLabel ?? 'What happens here'}
            </dt>
            <dd className="text-sm text-muted-foreground">{note}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
