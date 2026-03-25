import { Link } from '@/i18n/navigation';

type HowItWorksBoxProps = {
  title: string;
  description: string;
  bulletOne: string;
  bulletTwo: string;
  bulletThree: string;
  ctaLabel: string;
};

export function HowItWorksBox({
  title,
  description,
  bulletOne,
  bulletTwo,
  bulletThree,
  ctaLabel,
}: HowItWorksBoxProps) {
  const points = [bulletOne, bulletTwo, bulletThree];

  return (
    <section className="rounded-[1.5rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_78%,var(--background-surface)_22%)] p-5 md:p-6">
      <h2 className="font-display text-[clamp(1.5rem,2.5vw,2rem)] font-medium leading-[0.98] tracking-[-0.03em] text-foreground">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>

      <ul className="mt-6 space-y-3 border-t border-border/70 pt-5 text-sm leading-7 text-foreground">
        {points.map((point) => (
          <li key={point} className="flex gap-3">
            <span className="mt-[0.78rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-blue)]" aria-hidden="true" />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <Link
          href="/results/how-it-works"
          className="inline-flex items-center gap-2 text-sm font-semibold text-foreground underline-offset-4 transition-colors hover:text-[var(--brand-blue)] hover:underline"
        >
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}
