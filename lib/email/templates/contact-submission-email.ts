import { AppLocale } from '@/i18n/routing';

interface ContactEmailLabels {
  origin: string;
  name: string;
  email: string;
  preferredLocale: string;
  userId: string;
  inquiryType: string;
  createdAt: string;
  message: string;
  metadata: string;
}

interface ContactSubmissionEmailProps {
  locale: AppLocale;
  title: string;
  intro: string;
  labels: ContactEmailLabels;
  origin: string;
  name: string;
  email: string;
  preferredLocale: string;
  userId: string;
  inquiryType: string;
  createdAt: string;
  message: string;
  metadataText: string;
  footer: string;
}

export function renderContactSubmissionEmailHTML(props: ContactSubmissionEmailProps): string {
  const {
    locale,
    title,
    intro,
    labels,
    origin,
    name,
    email,
    preferredLocale,
    userId,
    inquiryType,
    createdAt,
    message,
    metadataText,
    footer,
  } = props;

  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const toHtml = (value: string) => escape(value).replace(/\n/g, '<br />');

  return `
    <!DOCTYPE html>
    <html lang="${locale}">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escape(title)}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; background: #f6f7fb; margin: 0; padding: 0;">
        <div style="max-width: 640px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 12px 35px rgba(0, 0, 0, 0.08);">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 28px 32px;">
            <h1 style="margin: 0; color: #ffffff; font-size: 24px; letter-spacing: 0.3px;">RungoMX</h1>
            <p style="margin: 8px 0 0; color: #e0e7ff; font-size: 14px;">${escape(title)}</p>
          </div>

          <div style="padding: 28px 32px;">
            <p style="margin: 0 0 16px; font-size: 15px; color: #4b5563;">${escape(intro)}</p>

            <div style="border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
              <div style="display: grid; grid-template-columns: 160px 1fr; background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                <div style="padding: 12px 14px; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">${escape(labels.origin)}</div>
                <div style="padding: 12px 14px; color: #111827;">${escape(origin)}</div>
              </div>
              <div style="display: grid; grid-template-columns: 160px 1fr; border-bottom: 1px solid #e5e7eb;">
                <div style="padding: 12px 14px; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">${escape(labels.name)}</div>
                <div style="padding: 12px 14px; color: #111827;">${escape(name)}</div>
              </div>
              <div style="display: grid; grid-template-columns: 160px 1fr; border-bottom: 1px solid #e5e7eb;">
                <div style="padding: 12px 14px; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">${escape(labels.email)}</div>
                <div style="padding: 12px 14px; color: #111827;">${escape(email)}</div>
              </div>
              <div style="display: grid; grid-template-columns: 160px 1fr; border-bottom: 1px solid #e5e7eb;">
                <div style="padding: 12px 14px; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">${escape(labels.preferredLocale)}</div>
                <div style="padding: 12px 14px; color: #111827;">${escape(preferredLocale)}</div>
              </div>
              <div style="display: grid; grid-template-columns: 160px 1fr; border-bottom: 1px solid #e5e7eb;">
                <div style="padding: 12px 14px; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">${escape(labels.userId)}</div>
                <div style="padding: 12px 14px; color: #111827;">${escape(userId)}</div>
              </div>
              <div style="display: grid; grid-template-columns: 160px 1fr; border-bottom: 1px solid #e5e7eb;">
                <div style="padding: 12px 14px; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">${escape(labels.inquiryType)}</div>
                <div style="padding: 12px 14px; color: #111827;">${escape(inquiryType)}</div>
              </div>
              <div style="display: grid; grid-template-columns: 160px 1fr; border-bottom: 1px solid #e5e7eb;">
                <div style="padding: 12px 14px; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">${escape(labels.createdAt)}</div>
                <div style="padding: 12px 14px; color: #111827;">${escape(createdAt)}</div>
              </div>
              <div style="display: grid; grid-template-columns: 160px 1fr; border-bottom: 1px solid #e5e7eb; background: #f9fafb;">
                <div style="padding: 12px 14px; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">${escape(labels.message)}</div>
                <div style="padding: 12px 14px; color: #111827; white-space: pre-wrap;">${toHtml(message)}</div>
              </div>
              <div style="display: grid; grid-template-columns: 160px 1fr;">
                <div style="padding: 12px 14px; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">${escape(labels.metadata)}</div>
                <div style="padding: 12px 14px; color: #111827; font-family: monospace; white-space: pre-wrap; background: #f8fafc;">${escape(metadataText)}</div>
              </div>
            </div>
          </div>

          <div style="padding: 16px 32px; background: #f9fafb; color: #6b7280; font-size: 12px; text-align: center; border-top: 1px solid #e5e7eb;">
            ${escape(footer)}
          </div>
        </div>
      </body>
    </html>
  `;
}

export function renderContactSubmissionEmailText(props: {
  intro: string;
  labels: ContactEmailLabels;
  origin: string;
  name: string;
  email: string;
  preferredLocale: string;
  userId: string;
  inquiryType: string;
  createdAt: string;
  message: string;
  metadataText: string;
  footer: string;
}): string {
  const {
    intro,
    labels,
    origin,
    name,
    email,
    preferredLocale,
    userId,
    inquiryType,
    createdAt,
    message,
    metadataText,
    footer,
  } = props;

  return [
    intro,
    '',
    `${labels.origin}: ${origin}`,
    `${labels.name}: ${name}`,
    `${labels.email}: ${email}`,
    `${labels.preferredLocale}: ${preferredLocale}`,
    `${labels.userId}: ${userId}`,
    `${labels.inquiryType}: ${inquiryType}`,
    `${labels.createdAt}: ${createdAt}`,
    '',
    `${labels.message}:`,
    message,
    '',
    `${labels.metadata}:`,
    metadataText,
    '',
    footer,
  ].join('\n');
}
