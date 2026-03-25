'use client';

import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const t = useTranslations('components.footer');

  const linkGroups = [
    {
      title: t('sections.about'),
      links: [
        { href: '/about', label: t('links.aboutUs') },
        { href: '/news', label: t('links.news') },
      ],
    },
    {
      title: t('sections.resources'),
      links: [
        { href: '/contact', label: t('links.contact') },
        { href: '/help', label: t('links.helpCenter') },
      ],
    },
    {
      title: t('sections.legal'),
      links: [
        { href: '/privacy', label: t('links.privacy') },
        { href: '/terms', label: t('links.terms') },
      ],
    },
  ] as const;

  return (
    <footer className="w-full border-t border-border/70 bg-[color-mix(in_oklch,var(--background)_90%,var(--background-surface)_10%)]">
      <div className="mx-auto w-full max-w-7xl px-5 py-12 md:px-6 md:py-14 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)] lg:gap-16">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--brand-blue)]">
              {t('sections.about')}
            </p>
            <h2 className="font-display mt-4 text-[clamp(1.9rem,3.4vw,3rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
              RunGoMX
            </h2>
            <p className="mt-4 max-w-[36rem] text-sm leading-7 text-muted-foreground md:text-base">
              {t('companyText')}
            </p>
            <div className="mt-6">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--brand-green-dark)]">
                {t('sections.connect')}
              </p>
              <p className="mt-3 max-w-[34rem] text-sm leading-7 text-muted-foreground">
                {t('trustLine')}
              </p>
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {linkGroups.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {group.title}
                </h3>
                <ul className="mt-5 space-y-3">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm leading-6 text-foreground/86 transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 pt-2">
          <p className="text-sm text-muted-foreground">{t('copyright', { year: currentYear })}</p>
        </div>
      </div>
    </footer>
  );
}
