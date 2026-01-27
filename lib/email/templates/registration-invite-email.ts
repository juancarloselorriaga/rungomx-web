import { AppLocale } from '@/i18n/routing';

type RegistrationInviteEmailProps = {
  locale: AppLocale;
  title: string;
  greeting: string;
  message: string;
  eventName: string;
  distanceLabel: string;
  expiresLabel: string;
  expiresAt: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function generateRegistrationInviteEmailHTML(props: RegistrationInviteEmailProps): string {
  const {
    locale,
    title,
    greeting,
    message,
    eventName,
    distanceLabel,
    expiresLabel,
    expiresAt,
    ctaLabel,
    ctaUrl,
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

            <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px;">
              <p style="margin: 0 0 4px; font-size: 14px; color: #6b7280;">${escapeHtml(eventName)}</p>
              <p style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #111827;">${escapeHtml(distanceLabel)}</p>
              <p style="margin: 0; font-size: 14px; color: #4b5563;"><strong>${escapeHtml(expiresLabel)}:</strong> ${escapeHtml(expiresAt)}</p>
            </div>

            <div style="text-align: center; margin: 24px 0 12px;">
              <a href="${escapeHtml(ctaUrl)}" style="background: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">${escapeHtml(ctaLabel)}</a>
            </div>
          </div>
          <div style="padding: 16px 32px; background: #f9fafb; color: #6b7280; font-size: 12px; text-align: center; border-top: 1px solid #e5e7eb;">
            ${escapeHtml(footer)}
          </div>
        </div>
      </body>
    </html>
  `;
}

export function generateRegistrationInviteEmailText(props: RegistrationInviteEmailProps): string {
  const { greeting, message, eventName, distanceLabel, expiresLabel, expiresAt, ctaLabel, ctaUrl, footer } = props;

  return [
    greeting,
    '',
    message,
    '',
    `${eventName} — ${distanceLabel}`,
    `${expiresLabel}: ${expiresAt}`,
    '',
    `${ctaLabel}: ${ctaUrl}`,
    '',
    footer,
  ].join('\n');
}
