import { Link } from '@/i18n/navigation';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(51,102,204,0.12),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(30,138,110,0.14),transparent_34%),color-mix(in_oklch,var(--background)_94%,var(--background-surface)_6%)]">
      <div className="absolute left-4 top-6 z-10 sm:left-6 lg:left-10 lg:top-10">
        <Link
          href="/"
          className="font-display text-[clamp(2rem,3vw,2.8rem)] font-medium tracking-[-0.04em] text-foreground"
        >
          RunGoMX
        </Link>
      </div>

      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 pb-8 pt-28 sm:px-6 sm:pb-10 sm:pt-32 lg:px-10 lg:py-12">
        <div className="w-full max-w-[34rem]">{children}</div>
      </main>
    </div>
  );
}
