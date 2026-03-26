import { Button } from '@/components/ui/button';
import { LogIn, UserPlus } from 'lucide-react';

type PublicLoginRequiredShellProps = {
  title: string;
  description: string;
  contextLabel?: string;
  eventName?: string;
  supportText?: string;
  signInLabel: string;
  signUpLabel: string;
  signInUrl: string;
  signUpUrl: string;
};

export function PublicLoginRequiredShell({
  title,
  description,
  contextLabel,
  eventName,
  supportText,
  signInLabel,
  signUpLabel,
  signInUrl,
  signUpUrl,
}: PublicLoginRequiredShellProps) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="overflow-hidden rounded-[2rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_78%,var(--background-surface)_22%)] shadow-[0_36px_110px_-72px_rgba(15,23,42,0.78)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="border-b border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(51,102,204,0.12),transparent_48%),radial-gradient(circle_at_bottom_right,rgba(30,138,110,0.14),transparent_42%),color-mix(in_oklch,var(--background)_70%,var(--background-surface)_30%)] px-6 py-7 sm:px-8 sm:py-9 lg:border-b-0 lg:border-r">
            <div className="flex size-12 items-center justify-center rounded-full border border-border/50 bg-background/92 text-foreground shadow-sm">
              <LogIn className="size-5" />
            </div>

            <div className="mt-8 space-y-3">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                RunGoMX
              </p>
              <h1 className="font-display text-[clamp(2.2rem,4.8vw,3.6rem)] font-medium leading-[0.9] tracking-[-0.04em] text-foreground">
                {title}
              </h1>
              <p className="max-w-[24rem] text-sm leading-7 text-muted-foreground sm:text-[0.98rem]">
                {description}
              </p>
            </div>

            {eventName ? (
              <div className="mt-8 rounded-[1.35rem] border border-border/45 bg-background/88 px-4 py-4">
                {contextLabel ? (
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {contextLabel}
                  </p>
                ) : null}
                <p className="mt-2 font-display text-[clamp(1.2rem,2.4vw,1.6rem)] font-medium leading-tight tracking-[-0.03em] text-foreground">
                  {eventName}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col justify-center px-6 py-7 sm:px-8 sm:py-9">
            <div className="space-y-4">
              {supportText ? (
                <div className="rounded-[1.35rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_84%,var(--background-surface)_16%)] px-4 py-4">
                  <p className="text-sm leading-7 text-muted-foreground">{supportText}</p>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Button asChild size="lg" className="min-w-0">
                  <a href={signInUrl}>
                    <LogIn className="mr-2 h-4 w-4" />
                    {signInLabel}
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="min-w-0">
                  <a href={signUpUrl}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    {signUpLabel}
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
