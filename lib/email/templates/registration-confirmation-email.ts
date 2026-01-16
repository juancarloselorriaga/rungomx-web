import { AppLocale } from '@/i18n/routing';

interface RegistrationEmailTemplateProps {
  locale: AppLocale;
  title: string;
  greeting: string;
  message: string;
  eventName: string;
  distanceLabel: string;
  eventDateLabel: string;
  eventDate: string;
  locationLabel: string;
  location?: string | null;
  ticketCodeLabel: string;
  ticketCode: string;
  registrationIdLabel: string;
  registrationId: string;
  ctaLabel: string;
  ctaUrl: string;
  qrAlt: string;
  qrUrl: string;
  reminder: string;
  footer: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function generateRegistrationEmailHTML(props: RegistrationEmailTemplateProps): string {
  const {
    locale,
    title,
    greeting,
    message,
    eventName,
    distanceLabel,
    eventDateLabel,
    eventDate,
    locationLabel,
    location,
    ticketCodeLabel,
    ticketCode,
    registrationIdLabel,
    registrationId,
    ctaLabel,
    ctaUrl,
    qrAlt,
    qrUrl,
    reminder,
    footer,
  } = props;

  return `
    <!DOCTYPE html>
    <html lang="${locale}">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(title)}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background: #f5f7fb;">
        <div style="max-width: 640px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 12px 35px rgba(0, 0, 0, 0.08);">
          <div style="background: linear-gradient(135deg, #2563eb 0%, #14b8a6 100%); padding: 28px 32px;">
            <h1 style="margin: 0; color: #ffffff; font-size: 26px;">RungoMX</h1>
            <p style="margin: 6px 0 0; color: #dbeafe; font-size: 14px;">${escapeHtml(title)}</p>
          </div>
          <div style="padding: 28px 32px;">
            <p style="margin: 0 0 12px; font-size: 18px; font-weight: 600;">${escapeHtml(greeting)}</p>
            <p style="margin: 0 0 20px; color: #4b5563;">${escapeHtml(message)}</p>

            <div style="display: grid; gap: 16px;">
              <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px;">
                <p style="margin: 0 0 4px; font-size: 14px; color: #6b7280;">${escapeHtml(eventName)}</p>
                <p style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #111827;">${escapeHtml(distanceLabel)}</p>
                <p style="margin: 0; font-size: 14px; color: #4b5563;"><strong>${escapeHtml(eventDateLabel)}:</strong> ${escapeHtml(eventDate)}</p>
                ${location ? `<p style="margin: 4px 0 0; font-size: 14px; color: #4b5563;"><strong>${escapeHtml(locationLabel)}:</strong> ${escapeHtml(location)}</p>` : ''}
              </div>

              <div style="display: flex; gap: 16px; align-items: center; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px;">
                <div style="flex: 1;">
                  <p style="margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280;">${escapeHtml(ticketCodeLabel)}</p>
                  <p style="margin: 4px 0 8px; font-size: 22px; font-weight: 700; letter-spacing: 0.2em; color: #111827;">${escapeHtml(ticketCode)}</p>
                  <p style="margin: 0; font-size: 12px; color: #6b7280;">${escapeHtml(registrationIdLabel)}: ${escapeHtml(registrationId)}</p>
                </div>
                <div style="flex-shrink: 0;">
                  <img src="${escapeHtml(qrUrl)}" alt="${escapeHtml(qrAlt)}" width="160" height="160" style="display: block; border-radius: 8px; border: 1px solid #e5e7eb;" />
                </div>
              </div>
            </div>

            <div style="text-align: center; margin: 24px 0 12px;">
              <a href="${escapeHtml(ctaUrl)}" style="background: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">${escapeHtml(ctaLabel)}</a>
            </div>

            <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center;">${escapeHtml(reminder)}</p>
          </div>
          <div style="padding: 16px 32px; background: #f9fafb; color: #6b7280; font-size: 12px; text-align: center; border-top: 1px solid #e5e7eb;">
            ${escapeHtml(footer)}
          </div>
        </div>
      </body>
    </html>
  `;
}

export function generateRegistrationEmailText(
  props: Pick<
    RegistrationEmailTemplateProps,
    | 'greeting'
    | 'message'
    | 'eventName'
    | 'distanceLabel'
    | 'eventDateLabel'
    | 'eventDate'
    | 'locationLabel'
    | 'location'
    | 'ticketCodeLabel'
    | 'ticketCode'
    | 'registrationIdLabel'
    | 'registrationId'
    | 'ctaLabel'
    | 'ctaUrl'
    | 'reminder'
    | 'footer'
  >,
): string {
  const {
    greeting,
    message,
    eventName,
    distanceLabel,
    eventDateLabel,
    eventDate,
    locationLabel,
    location,
    ticketCodeLabel,
    ticketCode,
    registrationIdLabel,
    registrationId,
    ctaLabel,
    ctaUrl,
    reminder,
    footer,
  } = props;

  return [
    greeting,
    '',
    message,
    '',
    `${eventName} - ${distanceLabel}`,
    `${eventDateLabel}: ${eventDate}`,
    location ? `${locationLabel}: ${location}` : null,
    '',
    `${ticketCodeLabel}: ${ticketCode}`,
    `${registrationIdLabel}: ${registrationId}`,
    '',
    `${ctaLabel}: ${ctaUrl}`,
    '',
    reminder,
    '',
    footer,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}
