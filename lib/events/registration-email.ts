import { siteUrl } from '@/config/url';
import { getPathname } from '@/i18n/navigation';
import { DEFAULT_TIMEZONE, type AppLocale, routing } from '@/i18n/routing';
import { sendEmail } from '@/lib/email';
import {
  generateRegistrationEmailHTML,
  generateRegistrationEmailText,
} from '@/lib/email/templates/registration-confirmation-email';
import { getMyRegistrationDetail } from '@/lib/events/queries';
import { formatRegistrationTicketCode } from '@/lib/events/tickets';
import { getTranslations } from 'next-intl/server';

const formatEventDate = (date: Date | null, locale: AppLocale, timezone?: string | null) => {
  if (!date) return '-';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone || DEFAULT_TIMEZONE,
  }).format(date);
};

type RegistrationEmailStatus = 'confirmed' | 'payment_pending';

type SendRegistrationEmailParams = {
  registrationId: string;
  userId: string;
  status: RegistrationEmailStatus;
  locale?: AppLocale | null;
  userEmail: string;
  userName?: string | null;
};

export async function sendRegistrationCompletionEmail(
  params: SendRegistrationEmailParams,
): Promise<void> {
  const { registrationId, userId, status, userEmail, userName } = params;
  const locale = params.locale ?? routing.defaultLocale;

  const detail = await getMyRegistrationDetail(userId, registrationId);
  if (!detail) {
    console.warn('[registration-email] Registration not found, skipping email', {
      registrationId,
    });
    return;
  }

  const registrantSnapshot = detail.registrant?.profileSnapshot ?? null;
  const registrantName = [
    registrantSnapshot?.firstName,
    registrantSnapshot?.lastName,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  const displayName = registrantName || userName || userEmail;

  const namespace =
    status === 'confirmed' ? 'emails.registrationConfirmation' : 'emails.registrationPaymentPending';
  const t = await getTranslations({ locale, namespace });

  const eventName = `${detail.event.seriesName} ${detail.event.editionLabel}`.trim();
  const eventDate = formatEventDate(detail.event.startsAt, locale, detail.event.timezone);
  const location =
    detail.event.locationDisplay ||
    [detail.event.city, detail.event.state].filter(Boolean).join(', ');

  const detailPath = getPathname({
    href: {
      pathname: '/dashboard/my-registrations/[registrationId]',
      params: { registrationId },
    } as Parameters<typeof getPathname>[0]['href'],
    locale,
  });
  const detailUrl = `${siteUrl}${detailPath === '/' ? '' : detailPath}`;
  const qrUrl = `${siteUrl}/api/tickets/qr/${registrationId}`;

  const currentYear = new Date().getFullYear();
  const ticketCode = formatRegistrationTicketCode(registrationId);

  const templateProps = {
    locale,
    title: t('title'),
    greeting: t('greeting', { userName: displayName }),
    message: t('message', { eventName }),
    eventName,
    distanceLabel: detail.distance.label,
    eventDateLabel: t('eventDateLabel'),
    eventDate,
    locationLabel: t('locationLabel'),
    location: location || null,
    ticketCodeLabel: t('ticketCodeLabel'),
    ticketCode,
    registrationIdLabel: t('registrationIdLabel'),
    registrationId,
    ctaLabel: t('ctaLabel'),
    ctaUrl: detailUrl,
    qrAlt: t('qrAlt'),
    qrUrl,
    reminder: t('reminder'),
    footer: t('footer', { year: currentYear }),
  };

  await sendEmail({
    to: { email: userEmail, name: displayName },
    subject: t('subject', { eventName }),
    htmlContent: generateRegistrationEmailHTML(templateProps),
    textContent: generateRegistrationEmailText(templateProps),
  });
}
