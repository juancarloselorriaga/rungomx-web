import { AppLocale } from '@/i18n/routing';

type BillingEmailBaseProps = {
  locale: AppLocale;
  title: string;
  greeting: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
};

type BillingEmailHtmlProps = BillingEmailBaseProps & {
  bodyHtml: string;
};

type BillingEmailTextProps = BillingEmailBaseProps & {
  bodyText: string[];
};

function renderBillingEmailHTML({
  locale,
  title,
  greeting,
  ctaLabel,
  ctaUrl,
  footer,
  bodyHtml,
}: BillingEmailHtmlProps): string {
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

          ${bodyHtml}

          <div style="text-align: center; margin: 30px 0;">
            <a href="${ctaUrl}"
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      color: white;
                      padding: 14px 40px;
                      text-decoration: none;
                      border-radius: 5px;
                      display: inline-block;
                      font-weight: bold;
                      font-size: 16px;">
              ${ctaLabel}
            </a>
          </div>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
          <p>${footer}</p>
        </div>
      </body>
    </html>
  `;
}

function renderBillingEmailText({
  greeting,
  ctaLabel,
  ctaUrl,
  footer,
  bodyText,
}: BillingEmailTextProps): string {
  return [
    greeting,
    '',
    ...bodyText,
    '',
    `${ctaLabel}: ${ctaUrl}`,
    '',
    footer,
  ].join('\n');
}

type TrialStartedEmailProps = {
  locale: AppLocale;
  title: string;
  greeting: string;
  message: string;
  features: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
};

export function generateTrialStartedEmailHTML(props: TrialStartedEmailProps): string {
  const { message, features, ...base } = props;
  return renderBillingEmailHTML({
    ...base,
    bodyHtml: `
      <p style="font-size: 16px; margin-bottom: 20px;">
        ${message}
      </p>
      <p style="font-size: 14px; color: #666; margin-top: 20px;">
        ${features}
      </p>
    `,
  });
}

export function generateTrialStartedEmailText(props: TrialStartedEmailProps): string {
  const { message, features, ...base } = props;
  return renderBillingEmailText({ ...base, bodyText: [message, '', features] });
}

type TrialExpiringSoonEmailProps = {
  locale: AppLocale;
  title: string;
  greeting: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
};

export function generateTrialExpiringSoonEmailHTML(props: TrialExpiringSoonEmailProps): string {
  const { message, ...base } = props;
  return renderBillingEmailHTML({
    ...base,
    bodyHtml: `
      <p style="font-size: 16px; margin-bottom: 20px;">
        ${message}
      </p>
    `,
  });
}

export function generateTrialExpiringSoonEmailText(props: TrialExpiringSoonEmailProps): string {
  const { message, ...base } = props;
  return renderBillingEmailText({ ...base, bodyText: [message] });
}

type SubscriptionEndedEmailProps = {
  locale: AppLocale;
  title: string;
  greeting: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
};

export function generateSubscriptionEndedEmailHTML(props: SubscriptionEndedEmailProps): string {
  const { message, ...base } = props;
  return renderBillingEmailHTML({
    ...base,
    bodyHtml: `
      <p style="font-size: 16px; margin-bottom: 20px;">
        ${message}
      </p>
    `,
  });
}

export function generateSubscriptionEndedEmailText(props: SubscriptionEndedEmailProps): string {
  const { message, ...base } = props;
  return renderBillingEmailText({ ...base, bodyText: [message] });
}

type CancelScheduledEmailProps = {
  locale: AppLocale;
  title: string;
  greeting: string;
  message: string;
  revertMessage: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
};

export function generateCancelScheduledEmailHTML(props: CancelScheduledEmailProps): string {
  const { message, revertMessage, ...base } = props;
  return renderBillingEmailHTML({
    ...base,
    bodyHtml: `
      <p style="font-size: 16px; margin-bottom: 20px;">
        ${message}
      </p>
      <p style="font-size: 14px; color: #666; margin-top: 20px;">
        ${revertMessage}
      </p>
    `,
  });
}

export function generateCancelScheduledEmailText(props: CancelScheduledEmailProps): string {
  const { message, revertMessage, ...base } = props;
  return renderBillingEmailText({ ...base, bodyText: [message, '', revertMessage] });
}
