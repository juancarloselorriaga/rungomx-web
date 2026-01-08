import { type AppLocale, routing } from '@/i18n/routing';
import { getSupportRecipients, sendEmail } from '@/lib/email';
import {
  generateUserDeletionAdminEmailHTML,
  generateUserDeletionAdminEmailText,
  generateUserDeletionUserEmailHTML,
  generateUserDeletionUserEmailText,
} from '@/lib/email/templates/user-deletion-email';
import { getTranslations } from 'next-intl/server';

export interface UserDeletionNotificationParams {
  deletedUser: {
    email: string;
    name: string;
  };
  deletedBy: {
    id: string;
    name: string;
  };
  isSelfDeletion: boolean;
  locale: AppLocale;
}

/**
 * Sends notification email to the deleted user.
 * Uses the user's preferred locale for the email content.
 */
export async function notifyDeletedUser(params: UserDeletionNotificationParams): Promise<void> {
  const { deletedUser, isSelfDeletion, locale } = params;

  const t = await getTranslations({
    locale,
    namespace: 'emails.userDeletion.user',
  });
  const currentYear = new Date().getFullYear();

  const templateProps = {
    locale,
    title: t('title'),
    greeting: t('greeting', { userName: deletedUser.name || deletedUser.email }),
    message: isSelfDeletion ? t('messageSelfDeleted') : t('messageAdminDeleted'),
    whatHappened: t('whatHappened'),
    dataExplanation: t('dataExplanation'),
    questions: t('questions'),
    farewell: t('farewell'),
    footer: t('footer', { year: currentYear }),
  };

  await sendEmail({
    to: { email: deletedUser.email, name: deletedUser.name || undefined },
    subject: t('subject'),
    htmlContent: generateUserDeletionUserEmailHTML(templateProps),
    textContent: generateUserDeletionUserEmailText(templateProps),
  });
}

/**
 * Sends notification email to support/admin team about the deletion.
 * Always uses the default locale (Spanish) for admin notifications.
 */
export async function notifySupportOfDeletion(params: UserDeletionNotificationParams): Promise<void> {
  const { deletedUser, deletedBy, isSelfDeletion } = params;

  const recipients = getSupportRecipients();
  if (recipients.length === 0) {
    console.warn('[user-deletion] No support recipients configured, skipping admin notification');
    return;
  }

  const supportLocale = routing.defaultLocale;
  const t = await getTranslations({
    locale: supportLocale,
    namespace: 'emails.userDeletion.admin',
  });
  const currentYear = new Date().getFullYear();

  const deletedByName = isSelfDeletion
    ? `${deletedUser.name || deletedUser.email} (self)`
    : deletedBy.name || deletedBy.id;

  const templateProps = {
    locale: supportLocale,
    title: t('title'),
    intro: t('intro'),
    labels: {
      deletedUser: t('labels.deletedUser'),
      deletedUserEmail: t('labels.deletedUserEmail'),
      deletedBy: t('labels.deletedBy'),
      deletionType: t('labels.deletionType'),
      deletedAt: t('labels.deletedAt'),
    },
    deletedUserName: deletedUser.name || 'N/A',
    deletedUserEmail: deletedUser.email,
    deletedByName,
    deletionType: isSelfDeletion ? t('deletionTypeSelf') : t('deletionTypeAdmin'),
    deletedAt: new Date().toISOString(),
    footer: t('footer', { year: currentYear }),
  };

  await sendEmail({
    to: recipients,
    subject: t('subject'),
    htmlContent: generateUserDeletionAdminEmailHTML(templateProps),
    textContent: generateUserDeletionAdminEmailText(templateProps),
  });
}

/**
 * Sends all deletion notification emails.
 * This is a fire-and-forget operation - failures are logged but don't throw.
 */
export async function sendUserDeletionNotifications(
  params: UserDeletionNotificationParams,
): Promise<void> {
  const results = await Promise.allSettled([
    notifyDeletedUser(params),
    notifySupportOfDeletion(params),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[user-deletion] Email notification failed:', result.reason);
    }
  }
}
