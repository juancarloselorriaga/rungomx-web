import { and, eq, isNull } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';

import { siteUrl } from '@/config/url';
import { db } from '@/db';
import { billingSubscriptions, users } from '@/db/schema';
import { getPathname } from '@/i18n/navigation';
import { type AppLocale } from '@/i18n/routing';
import { sendEmail } from '@/lib/email';
import { getProfileByUserId } from '@/lib/profiles/repository';
import enEmailMessages from '@/messages/emails/en.json';
import esEmailMessages from '@/messages/emails/es.json';
import {
  generateCancelScheduledEmailHTML,
  generateCancelScheduledEmailText,
  generateGraceReminderEmailHTML,
  generateGraceReminderEmailText,
  generateSubscriptionEndedEmailHTML,
  generateSubscriptionEndedEmailText,
  generateTrialExpiringSoonEmailHTML,
  generateTrialExpiringSoonEmailText,
  generateTrialStartedEmailHTML,
  generateTrialStartedEmailText,
} from '@/lib/email/templates/billing-email';

import { BILLING_TRIAL_DAYS } from './constants';

const DEFAULT_LOCALE: AppLocale = 'es';
const BILLING_EMAIL_MESSAGES = {
  en: enEmailMessages.billing,
  es: esEmailMessages.billing,
} as const;

const formatBillingDate = (date: Date, locale: AppLocale) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);

const buildBillingCtaUrl = (locale: AppLocale) => {
  const path = getPathname({ href: '/settings/billing', locale });
  return `${siteUrl}${path === '/' ? '' : path}`;
};

const resolveLocale = (locale?: string | null): AppLocale => {
  if (locale === 'en' || locale === 'es') return locale;
  return DEFAULT_LOCALE;
};

const getBillingEmailFallbackTranslator = (locale: AppLocale) =>
  (key: string, values?: Record<string, string | number>) => {
    const template = key
      .split('.')
      .reduce<unknown>(
        (current, segment) =>
          current && typeof current === 'object'
            ? (current as Record<string, unknown>)[segment]
            : undefined,
        BILLING_EMAIL_MESSAGES[locale],
      );

    if (typeof template !== 'string') {
      throw new Error(`Missing billing email message for key "${key}" and locale "${locale}"`);
    }

    if (!values) {
      return template;
    }

    return template.replace(/\{(\w+)\}/g, (match, placeholder: string) => {
      const value = values[placeholder];
      return value === undefined ? match : String(value);
    });
  };

async function loadBillingEmailTranslator(locale: AppLocale) {
  try {
    return await getTranslations({ locale, namespace: 'emails.billing' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not supported in Client Components')) {
      return getBillingEmailFallbackTranslator(locale);
    }

    throw error;
  }
}

async function loadUserEmailContext(userId: string) {
  const user = await db.query.users.findFirst({
    where: and(eq(users.id, userId), isNull(users.deletedAt)),
    columns: { email: true, name: true },
  });

  if (!user?.email) {
    return null;
  }

  const profile = await getProfileByUserId(userId);
  const locale = resolveLocale(profile?.locale ?? null);
  const displayName = user.name || user.email;

  return { user, locale, displayName };
}

export async function sendTrialStartedEmail({ userId }: { userId: string }): Promise<void> {
  try {
    const context = await loadUserEmailContext(userId);
    if (!context) {
      console.error('[billing][email] Trial started email skipped: user not found', { userId });
      return;
    }

    const subscription = await db.query.billingSubscriptions.findFirst({
      where: and(
        eq(billingSubscriptions.userId, userId),
        eq(billingSubscriptions.status, 'trialing'),
      ),
      columns: { trialEndsAt: true },
    });

    if (!subscription?.trialEndsAt) {
      console.error('[billing][email] Trial started email skipped: missing trial end date', {
        userId,
      });
      return;
    }

    const { user, locale, displayName } = context;
    const t = await loadBillingEmailTranslator(locale);
    const currentYear = new Date().getFullYear();
    const ctaUrl = buildBillingCtaUrl(locale);
    const trialEndsAt = formatBillingDate(subscription.trialEndsAt, locale);

    const templateProps = {
      locale,
      title: t('trialStarted.title'),
      greeting: t('trialStarted.greeting', { userName: displayName }),
      message: t('trialStarted.message', { trialDays: BILLING_TRIAL_DAYS, trialEndsAt }),
      features: t('trialStarted.features'),
      ctaLabel: t('trialStarted.cta'),
      ctaUrl,
      footer: t('trialStarted.footer', { year: currentYear }),
    };

    await sendEmail({
      to: { email: user.email, name: displayName },
      subject: t('trialStarted.subject'),
      htmlContent: generateTrialStartedEmailHTML(templateProps),
      textContent: generateTrialStartedEmailText(templateProps),
    });
  } catch (error) {
    console.error('[billing][email] Trial started email failed:', error);
  }
}

export async function sendTrialExpiringSoonEmail({
  userId,
  trialEndsAt,
}: {
  userId: string;
  trialEndsAt: Date;
}): Promise<void> {
  try {
    const context = await loadUserEmailContext(userId);
    if (!context) {
      console.error('[billing][email] Trial expiring email skipped: user not found', { userId });
      return;
    }

    const { user, locale, displayName } = context;
    const t = await loadBillingEmailTranslator(locale);
    const currentYear = new Date().getFullYear();
    const ctaUrl = buildBillingCtaUrl(locale);
    const formattedEndsAt = formatBillingDate(trialEndsAt, locale);

    const templateProps = {
      locale,
      title: t('trialExpiringSoon.title'),
      greeting: t('trialExpiringSoon.greeting', { userName: displayName }),
      message: t('trialExpiringSoon.message', { trialEndsAt: formattedEndsAt }),
      ctaLabel: t('trialExpiringSoon.cta'),
      ctaUrl,
      footer: t('trialExpiringSoon.footer', { year: currentYear }),
    };

    await sendEmail({
      to: { email: user.email, name: displayName },
      subject: t('trialExpiringSoon.subject'),
      htmlContent: generateTrialExpiringSoonEmailHTML(templateProps),
      textContent: generateTrialExpiringSoonEmailText(templateProps),
    });
  } catch (error) {
    console.error('[billing][email] Trial expiring email failed:', error);
  }
}

export async function sendGracePeriodReminderEmail({
  userId,
  graceEndsAt,
  daysRemaining,
}: {
  userId: string;
  graceEndsAt: Date;
  daysRemaining: number;
}): Promise<void> {
  try {
    const context = await loadUserEmailContext(userId);
    if (!context) {
      console.error('[billing][email] Grace reminder email skipped: user not found', { userId });
      return;
    }

    const { user, locale, displayName } = context;
    const t = await loadBillingEmailTranslator(locale);
    const currentYear = new Date().getFullYear();
    const ctaUrl = buildBillingCtaUrl(locale);
    const formattedEndsAt = formatBillingDate(graceEndsAt, locale);

    const templateProps = {
      locale,
      title: t('graceReminder.title'),
      greeting: t('graceReminder.greeting', { userName: displayName }),
      message: t('graceReminder.message', {
        graceEndsAt: formattedEndsAt,
        daysRemaining,
      }),
      ctaLabel: t('graceReminder.cta'),
      ctaUrl,
      footer: t('graceReminder.footer', { year: currentYear }),
    };

    await sendEmail({
      to: { email: user.email, name: displayName },
      subject: t('graceReminder.subject'),
      htmlContent: generateGraceReminderEmailHTML(templateProps),
      textContent: generateGraceReminderEmailText(templateProps),
    });
  } catch (error) {
    console.error('[billing][email] Grace reminder email failed:', error);
  }
}

export async function sendSubscriptionEndedEmail({
  userId,
  endedStatus,
}: {
  userId: string;
  endedStatus: 'trial' | 'active' | 'grace';
}): Promise<void> {
  try {
    const context = await loadUserEmailContext(userId);
    if (!context) {
      console.error('[billing][email] Subscription ended email skipped: user not found', { userId });
      return;
    }

    const { user, locale, displayName } = context;
    const t = await loadBillingEmailTranslator(locale);
    const currentYear = new Date().getFullYear();
    const ctaUrl = buildBillingCtaUrl(locale);
    const messageKey =
      endedStatus === 'trial'
        ? 'subscriptionEnded.messageTrial'
        : endedStatus === 'grace'
          ? 'subscriptionEnded.messageGrace'
          : 'subscriptionEnded.messageActive';

    const templateProps = {
      locale,
      title: t('subscriptionEnded.title'),
      greeting: t('subscriptionEnded.greeting', { userName: displayName }),
      message: t(messageKey),
      ctaLabel: t('subscriptionEnded.cta'),
      ctaUrl,
      footer: t('subscriptionEnded.footer', { year: currentYear }),
    };

    await sendEmail({
      to: { email: user.email, name: displayName },
      subject: t('subscriptionEnded.subject'),
      htmlContent: generateSubscriptionEndedEmailHTML(templateProps),
      textContent: generateSubscriptionEndedEmailText(templateProps),
    });
  } catch (error) {
    console.error('[billing][email] Subscription ended email failed:', error);
  }
}

export async function sendCancelScheduledEmail({
  userId,
  endsAt,
}: {
  userId: string;
  endsAt: Date;
}): Promise<void> {
  try {
    const context = await loadUserEmailContext(userId);
    if (!context) {
      console.error('[billing][email] Cancel scheduled email skipped: user not found', { userId });
      return;
    }

    const { user, locale, displayName } = context;
    const t = await loadBillingEmailTranslator(locale);
    const currentYear = new Date().getFullYear();
    const ctaUrl = buildBillingCtaUrl(locale);
    const formattedEndsAt = formatBillingDate(endsAt, locale);

    const templateProps = {
      locale,
      title: t('cancelScheduled.title'),
      greeting: t('cancelScheduled.greeting', { userName: displayName }),
      message: t('cancelScheduled.message', { endsAt: formattedEndsAt }),
      revertMessage: t('cancelScheduled.revertMessage'),
      ctaLabel: t('cancelScheduled.cta'),
      ctaUrl,
      footer: t('cancelScheduled.footer', { year: currentYear }),
    };

    await sendEmail({
      to: { email: user.email, name: displayName },
      subject: t('cancelScheduled.subject'),
      htmlContent: generateCancelScheduledEmailHTML(templateProps),
      textContent: generateCancelScheduledEmailText(templateProps),
    });
  } catch (error) {
    console.error('[billing][email] Cancel scheduled email failed:', error);
  }
}
