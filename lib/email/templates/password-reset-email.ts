import { AppLocale } from '@/i18n/routing';

interface PasswordResetEmailTemplateProps {
  greeting: string;
  message: string;
  url: string;
  button: string;
  ignoreMessage: string;
  alternativeText: string;
  expirationNote: string;
  footer: string;
  title: string;
  locale: AppLocale;
}

export function generatePasswordResetEmailHTML({
  greeting,
  message,
  url,
  button,
  ignoreMessage,
  alternativeText,
  expirationNote,
  footer,
  title,
  locale
}: PasswordResetEmailTemplateProps): string {
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

          <div style="text-align: center; margin: 30px 0;">
            <a href="${url}"
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      color: white;
                      padding: 14px 40px;
                      text-decoration: none;
                      border-radius: 5px;
                      display: inline-block;
                      font-weight: bold;
                      font-size: 16px;">
              ${button}
            </a>
          </div>

          <p style="font-size: 14px; color: #e67e22; background: #fef5e7; padding: 12px; border-left: 4px solid #e67e22; border-radius: 4px; margin: 20px 0;">
            <strong>⚠️ ${expirationNote}</strong>
          </p>

          <p style="font-size: 14px; color: #666; margin-top: 30px;">
            ${ignoreMessage}
          </p>

          <p style="font-size: 14px; color: #666;">
            ${alternativeText}
          </p>

          <p style="font-size: 12px; color: #999; word-break: break-all; background: #fff; padding: 10px; border-radius: 5px;">
            ${url}
          </p>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
          <p>${footer}</p>
        </div>
      </body>
    </html>
  `;
}

export function generatePasswordResetEmailText({
  greeting,
  message,
  url,
  expirationNote,
  ignoreMessage,
  footer,
}: Pick<PasswordResetEmailTemplateProps, 'greeting' | 'message' | 'url' | 'expirationNote' | 'ignoreMessage' | 'footer'>): string {
  return `
${greeting}

${message}

${url}

⚠️ ${expirationNote}

${ignoreMessage}

${footer}
  `.trim();
}
