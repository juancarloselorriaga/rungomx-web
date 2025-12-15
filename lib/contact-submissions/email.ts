import { type AppLocale, routing } from '@/i18n/routing';
import { getSupportRecipients, sendEmail } from '@/lib/email';
import {
  renderContactSubmissionEmailHTML,
  renderContactSubmissionEmailText,
} from '@/lib/email/templates/contact-submission-email';
import type { ContactSubmissionRecord } from './types';
import { formatDate, normalizeMetadata, stringifyMetadata } from './utils';

/**
 * Email notification service for contact submissions
 * Handles sending notifications to support team when new submissions are received
 */

/**
 * Sends email notification to support team about a new contact submission
 *
 * @param submission - Contact submission record from database
 * @param userLocale - User's preferred locale (defaults to default locale)
 * @throws {Error} If BREVO_SUPPORT_RECIPIENTS is not configured
 * @throws {Error} If email sending fails
 */
export async function notifySupportOfSubmission(
  submission: ContactSubmissionRecord,
  userLocale: AppLocale = routing.defaultLocale,
): Promise<void> {
  const recipients = getSupportRecipients();

  if (recipients.length === 0) {
    const error = 'BREVO_SUPPORT_RECIPIENTS environment variable is not configured';
    console.error('[contact-submission]', error);
    throw new Error(error);
  }

  const supportLocale = routing.defaultLocale;
  const metadata = normalizeMetadata(submission.metadata);
  const { preferredLocale, ...restMetadata } = metadata as {
    preferredLocale?: unknown;
  } & Record<string, unknown>;

  const preferredLocaleValue = typeof preferredLocale === 'string' ? preferredLocale : userLocale;
  const metadataText = stringifyMetadata(restMetadata);
  const createdAt = formatDate(submission.createdAt);

  const subject = `[${submission.origin}] Nuevo mensaje de contacto`;
  const labels = {
    origin: 'Origen',
    name: 'Nombre',
    email: 'Email',
    preferredLocale: 'Idioma preferido',
    userId: 'ID de usuario',
    createdAt: 'Creado',
    message: 'Mensaje',
    metadata: 'Metadata',
  };

  const htmlContent = renderContactSubmissionEmailHTML({
    locale: supportLocale,
    title: 'Nueva solicitud de contacto',
    intro: 'Alguien envió un mensaje desde el sitio. Estos son los detalles:',
    labels,
    origin: submission.origin,
    name: submission.name || 'Desconocido',
    email: submission.email || 'Desconocido',
    preferredLocale: preferredLocaleValue,
    userId: submission.userId || 'Anónimo',
    createdAt,
    message: submission.message,
    metadataText: metadataText || 'N/A',
    footer: `© ${new Date().getFullYear()} RungoMX. Todos los derechos reservados.`,
  });

  const textContent = renderContactSubmissionEmailText({
    intro: 'Alguien envió un mensaje desde el sitio. Estos son los detalles:',
    labels,
    origin: submission.origin,
    name: submission.name || 'Desconocido',
    email: submission.email || 'Desconocido',
    preferredLocale: preferredLocaleValue,
    userId: submission.userId || 'Anónimo',
    createdAt,
    message: submission.message,
    metadataText: metadataText || 'N/A',
    footer: `© ${new Date().getFullYear()} RungoMX. Todos los derechos reservados.`,
  });

  try {
    await sendEmail({
      to: recipients,
      subject,
      htmlContent,
      textContent,
    });
  } catch (error) {
    console.error('[contact-submission] Failed to send email notification', error);
    throw error;
  }
}
