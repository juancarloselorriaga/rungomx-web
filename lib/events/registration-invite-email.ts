import { siteUrl } from '@/config/url';
import { getPathname } from '@/i18n/navigation';
import { DEFAULT_TIMEZONE, type AppLocale, routing } from '@/i18n/routing';
import { sendEmail } from '@/lib/email';
import {
  generateRegistrationInviteEmailHTML,
  generateRegistrationInviteEmailText,
} from '@/lib/email/templates/registration-invite-email';
import { getTranslations } from 'next-intl/server';

const formatDateTime = (date: Date, locale: AppLocale, timezone?: string | null) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone || DEFAULT_TIMEZONE,
  }).format(date);

type SendInviteEmailParams = {
  inviteId: string;
  email: string;
  locale: string;
  seriesSlug: string;
  editionSlug: string;
  eventName: string;
  distanceLabel: string;
  expiresAt: Date;
  token: string;
  timezone?: string | null;
  recipientName?: string | null;
};

export async function sendRegistrationInviteEmail(params: SendInviteEmailParams): Promise<void> {
  const locale = (params.locale as AppLocale) ?? routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'emails.registrationInvite' });

  const claimPath = getPathname({
    href: {
      pathname: '/events/[seriesSlug]/[editionSlug]/claim/[inviteToken]',
      params: {
        seriesSlug: params.seriesSlug,
        editionSlug: params.editionSlug,
        inviteToken: params.token,
      },
    } as Parameters<typeof getPathname>[0]['href'],
    locale,
  });

  const claimUrl = `${siteUrl}${claimPath === '/' ? '' : claimPath}`;
  const expiresAtFormatted = formatDateTime(params.expiresAt, locale, params.timezone);
  const displayName = params.recipientName || params.email;

  const templateProps = {
    locale,
    title: t('title'),
    greeting: t('greeting', { userName: displayName }),
    message: t('message', { eventName: params.eventName }),
    eventName: params.eventName,
    distanceLabel: params.distanceLabel,
    expiresLabel: t('expiresLabel'),
    expiresAt: expiresAtFormatted,
    ctaLabel: t('ctaLabel'),
    ctaUrl: claimUrl,
    footer: t('footer', { year: new Date().getFullYear() }),
  };

  await sendEmail({
    to: { email: params.email, name: displayName },
    subject: t('subject', { eventName: params.eventName }),
    htmlContent: generateRegistrationInviteEmailHTML(templateProps),
    textContent: generateRegistrationInviteEmailText(templateProps),
  });
}
