import { AppLocale } from '@/i18n/routing';
import { TransactionalEmailsApi, TransactionalEmailsApiApiKeys } from '@getbrevo/brevo';
import { getTranslations } from 'next-intl/server';
import {
  generateVerificationEmailHTML,
  generateVerificationEmailText,
} from './email/templates/verification-email';

const emailApi = new TransactionalEmailsApi();
emailApi.setApiKey(
  TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY || ''
);

interface SendEmailOptions {
  to: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  toName?: string;
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

  try {
    const result = await emailApi.sendTransacEmail({
      to: [{ email: to, name: toName }],
      subject,
      htmlContent,
      textContent,
      sender: { email: senderEmail, name: senderName },
    });

    console.log('✅ Email sent successfully. Message ID:', result.body.messageId);
    return result;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw error;
  }
}

export async function sendVerificationEmail({
  email,
  url,
  userName,
  locale,
}: {
  email: string;
  url: string;
  userName: string;
  locale: AppLocale;
}) {
  const t = await getTranslations({ locale: locale, namespace: 'emails.verification' });
  const currentYear = new Date().getFullYear();

  const templateProps = {
    greeting: t('greeting', { userName }),
    message: t('message'),
    button: t('button'),
    ignoreMessage: t('ignoreMessage'),
    alternativeText: t('alternativeText'),
    footer: t('footer', { year: currentYear }),
    title: t('title'),
    url,
  };

  const htmlContent = generateVerificationEmailHTML(templateProps);
  const textContent = generateVerificationEmailText(templateProps);

  return sendEmail({
    to: email,
    toName: userName,
    subject: t('subject'),
    htmlContent,
    textContent,
  });
}
