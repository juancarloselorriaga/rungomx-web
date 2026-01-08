import { AppLocale } from '@/i18n/routing';

// ============ USER EMAIL (sent to deleted user) ============

interface UserDeletionUserEmailProps {
  locale: AppLocale;
  title: string;
  greeting: string;
  message: string;
  whatHappened: string;
  dataExplanation: string;
  questions: string;
  farewell: string;
  footer: string;
}

export function generateUserDeletionUserEmailHTML(props: UserDeletionUserEmailProps): string {
  const {
    locale,
    title,
    greeting,
    message,
    whatHappened,
    dataExplanation,
    questions,
    farewell,
    footer,
  } = props;

  return `
    <!DOCTYPE html>
    <html lang="${locale}">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">RungoMX</h1>
        </div>

        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">${greeting}</h2>

          <p style="font-size: 16px; margin-bottom: 20px;">
            ${message}
          </p>

          <h3 style="color: #555; margin-top: 24px;">${whatHappened}</h3>
          <p style="font-size: 14px; color: #666;">
            ${dataExplanation}
          </p>

          <p style="font-size: 14px; color: #666; margin-top: 20px;">
            ${questions}
          </p>

          <p style="font-size: 16px; color: #333; margin-top: 24px; font-style: italic;">
            ${farewell}
          </p>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
          <p>${footer}</p>
        </div>
      </body>
    </html>
  `;
}

export function generateUserDeletionUserEmailText(
  props: Pick<
    UserDeletionUserEmailProps,
    'greeting' | 'message' | 'whatHappened' | 'dataExplanation' | 'questions' | 'farewell' | 'footer'
  >,
): string {
  const { greeting, message, whatHappened, dataExplanation, questions, farewell, footer } = props;

  return `
${greeting}

${message}

${whatHappened}
${dataExplanation}

${questions}

${farewell}

${footer}
  `.trim();
}

// ============ ADMIN EMAIL (sent to support) ============

interface UserDeletionAdminEmailLabels {
  deletedUser: string;
  deletedUserEmail: string;
  deletedBy: string;
  deletionType: string;
  deletedAt: string;
}

interface UserDeletionAdminEmailProps {
  locale: AppLocale;
  title: string;
  intro: string;
  labels: UserDeletionAdminEmailLabels;
  deletedUserName: string;
  deletedUserEmail: string;
  deletedByName: string;
  deletionType: string;
  deletedAt: string;
  footer: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function generateUserDeletionAdminEmailHTML(props: UserDeletionAdminEmailProps): string {
  const {
    locale,
    title,
    intro,
    labels,
    deletedUserName,
    deletedUserEmail,
    deletedByName,
    deletionType,
    deletedAt,
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
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; background: #f6f7fb; margin: 0; padding: 0;">
        <div style="max-width: 640px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 12px 35px rgba(0, 0, 0, 0.08);">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 28px 32px;">
            <h1 style="margin: 0; color: #ffffff; font-size: 24px; letter-spacing: 0.3px;">RungoMX</h1>
            <p style="margin: 8px 0 0; color: #e0e7ff; font-size: 14px;">${escapeHtml(title)}</p>
          </div>

          <div style="padding: 28px 32px;">
            <p style="margin: 0 0 16px; font-size: 15px; color: #4b5563;">${escapeHtml(intro)}</p>

            <div style="border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
              <div style="display: grid; grid-template-columns: 160px 1fr; background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                <div style="padding: 12px 14px; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">${escapeHtml(labels.deletedUser)}</div>
                <div style="padding: 12px 14px; color: #111827;">${escapeHtml(deletedUserName)}</div>
              </div>
              <div style="display: grid; grid-template-columns: 160px 1fr; border-bottom: 1px solid #e5e7eb;">
                <div style="padding: 12px 14px; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">${escapeHtml(labels.deletedUserEmail)}</div>
                <div style="padding: 12px 14px; color: #111827;">${escapeHtml(deletedUserEmail)}</div>
              </div>
              <div style="display: grid; grid-template-columns: 160px 1fr; border-bottom: 1px solid #e5e7eb;">
                <div style="padding: 12px 14px; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">${escapeHtml(labels.deletedBy)}</div>
                <div style="padding: 12px 14px; color: #111827;">${escapeHtml(deletedByName)}</div>
              </div>
              <div style="display: grid; grid-template-columns: 160px 1fr; border-bottom: 1px solid #e5e7eb;">
                <div style="padding: 12px 14px; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">${escapeHtml(labels.deletionType)}</div>
                <div style="padding: 12px 14px; color: #111827;">${escapeHtml(deletionType)}</div>
              </div>
              <div style="display: grid; grid-template-columns: 160px 1fr;">
                <div style="padding: 12px 14px; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">${escapeHtml(labels.deletedAt)}</div>
                <div style="padding: 12px 14px; color: #111827;">${escapeHtml(deletedAt)}</div>
              </div>
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

export function generateUserDeletionAdminEmailText(
  props: Omit<UserDeletionAdminEmailProps, 'locale' | 'title'>,
): string {
  const { intro, labels, deletedUserName, deletedUserEmail, deletedByName, deletionType, deletedAt, footer } = props;

  return [
    intro,
    '',
    `${labels.deletedUser}: ${deletedUserName}`,
    `${labels.deletedUserEmail}: ${deletedUserEmail}`,
    `${labels.deletedBy}: ${deletedByName}`,
    `${labels.deletionType}: ${deletionType}`,
    `${labels.deletedAt}: ${deletedAt}`,
    '',
    footer,
  ].join('\n');
}
