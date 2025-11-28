import { AppLocale } from '@/i18n/routing';
import { TransactionalEmailsApi, TransactionalEmailsApiApiKeys } from '@getbrevo/brevo';
import { getTranslations } from 'next-intl/server';
import {
  generateVerificationEmailHTML,
  generateVerificationEmailText,
} from './email/templates/verification-email';
import {
  generatePasswordResetEmailHTML,
  generatePasswordResetEmailText,
} from './email/templates/password-reset-email';

const emailApi = new TransactionalEmailsApi();
emailApi.setApiKey(
  TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY || ''
);

export interface EmailRecipient {
  email: string;
  name?: string;
}

interface SendEmailOptions {
  to: EmailRecipient | EmailRecipient[] | string | string[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  toName?: string;
}

function normalizeRecipients(
  recipients: SendEmailOptions['to'],
  fallbackName?: string
): EmailRecipient[] {
  const normalized = Array.isArray(recipients) ? recipients : [recipients];
  const cleaned: EmailRecipient[] = [];

  for (const recipient of normalized) {
    if (typeof recipient === 'string') {
      const email = recipient.trim();
      if (email) {
        cleaned.push({ email, name: fallbackName });
      }
      continue;
    }

    if (recipient) {
      const email = (recipient as EmailRecipient).email.trim();
      if (email) {
        cleaned.push({ email, name: (recipient as EmailRecipient).name });
      }
    }
  }

  return cleaned;
}

export function getSupportRecipients(): EmailRecipient[] {
  const value = process.env.BREVO_SUPPORT_RECIPIENTS;
  if (!value) return [];

  return value
    .split(/[,;\n]/)
    .map((email) => email.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
}

export async function sendEmail({
  to,
  subject,
  htmlContent,
  textContent,
  toName,
}: SendEmailOptions) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'RungoMX';

  if (!senderEmail) {
    throw new Error('BREVO_SENDER_EMAIL environment variable is not set');
  }

  if (!process.env.BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY environment variable is not set');
  }

  const recipients = normalizeRecipients(to, toName);
  if (recipients.length === 0) {
    throw new Error('No email recipients provided');
  }

  try {
    const result = await emailApi.sendTransacEmail({
      to: recipients,
      subject,
      htmlContent,
      textContent,
      sender: {
        email: senderEmail,
        name: senderName
      },
    });

    console.log('✅ Email sent successfully. Message ID:', result.body.messageId);
    return result;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw error;
  }
}

interface VerificationEmailParams {
  email: string;
  url: string;
  userName: string;
  locale: AppLocale;
}

async function buildVerificationTemplateProps(
  url: string,
  userName: string,
  locale: AppLocale
) {
  const t = await getTranslations({
    locale,
    namespace: 'emails.verification'
  });
  const currentYear = new Date().getFullYear();

  return {
    greeting: t('greeting', { userName }),
    message: t('message'),
    button: t('button'),
    ignoreMessage: t('ignoreMessage'),
    alternativeText: t('alternativeText'),
    footer: t('footer', { year: currentYear }),
    title: t('title'),
    url,
    locale
  };
}

export async function sendVerificationEmail({
  email,
  url,
  userName,
  locale,
}: VerificationEmailParams) {
  const templateProps = await buildVerificationTemplateProps(url, userName, locale);
  const t = await getTranslations({
    locale,
    namespace: 'emails.verification'
  });

  return sendEmail({
    to: { email, name: userName },
    subject: t('subject'),
    htmlContent: generateVerificationEmailHTML(templateProps),
    textContent: generateVerificationEmailText(templateProps),
  });
}

interface PasswordResetEmailParams {
  email: string;
  url: string;
  userName: string;
  locale: AppLocale;
}

async function buildPasswordResetTemplateProps(
  url: string,
  userName: string,
  locale: AppLocale
) {
  const t = await getTranslations({
    locale,
    namespace: 'emails.passwordReset'
  });
  const currentYear = new Date().getFullYear();

  return {
    greeting: t('greeting', { userName }),
    message: t('message'),
    button: t('button'),
    ignoreMessage: t('ignoreMessage'),
    alternativeText: t('alternativeText'),
    expirationNote: t('expirationNote'),
    footer: t('footer', { year: currentYear }),
    title: t('title'),
    url,
    locale
  };
}

export async function sendPasswordResetEmail({
  email,
  url,
  userName,
  locale,
}: PasswordResetEmailParams) {
  const templateProps = await buildPasswordResetTemplateProps(url, userName, locale);
  const t = await getTranslations({
    locale,
    namespace: 'emails.passwordReset'
  });

  return sendEmail({
    to: { email, name: userName },
    subject: t('subject'),
    htmlContent: generatePasswordResetEmailHTML(templateProps),
    textContent: generatePasswordResetEmailText(templateProps),
  });
}
