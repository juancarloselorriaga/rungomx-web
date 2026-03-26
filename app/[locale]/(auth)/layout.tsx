import { Link } from '@/i18n/navigation';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[color-mix(in_oklch,var(--background)_96%,var(--background-surface)_4%)]">
      <div className="border-b border-border/60 bg-[color-mix(in_oklch,var(--background)_94%,var(--background-surface)_6%)]">
        <div className="mx-auto flex w-full max-w-7xl items-center px-4 py-5 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="font-display text-[clamp(2rem,3vw,2.8rem)] font-medium tracking-[-0.04em] text-foreground"
          >
            RunGoMX
          </Link>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-7xl justify-center px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
