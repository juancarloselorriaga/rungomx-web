import { InsetSurface, Surface } from '@/components/ui/surface';

type ResultsPageHeroProps = {
  title: string;
  description: string;
  stats: Array<{
    label: string;
    value: string;
  }>;
};

export function ResultsPageHero({ title, description, stats }: ResultsPageHeroProps) {
  return (
    <Surface className="overflow-hidden border-border/60 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)] p-6 sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p>
        </div>

        <InsetSurface className="border-border/60 bg-background/80 p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-border/60 bg-background/70 p-3"
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {stat.label}
                </p>
                <p className="text-sm font-medium text-foreground">{stat.value}</p>
              </div>
            ))}
          </div>
        </InsetSurface>
      </div>
    </Surface>
  );
}
