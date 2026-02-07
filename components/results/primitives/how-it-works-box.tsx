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
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>

      <ul className="mt-3 space-y-2 text-sm text-foreground">
        <li>• {bulletOne}</li>
        <li>• {bulletTwo}</li>
        <li>• {bulletThree}</li>
      </ul>

      <div className="mt-4">
        <Link
          href="/results/how-it-works"
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}
