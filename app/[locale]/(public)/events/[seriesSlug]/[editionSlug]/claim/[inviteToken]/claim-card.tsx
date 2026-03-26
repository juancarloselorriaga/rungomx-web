'use client';

import { PublicStatusShell } from '@/components/common';
import {
  publicBodyTextClassName,
  publicFieldClassName,
  publicMutedPanelClassName,
  publicPanelClassName,
} from '@/components/common/public-form-styles';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FormField } from '@/components/ui/form-field';
import { useRouter } from '@/i18n/navigation';
import { Form, FormError, useForm } from '@/lib/forms';
import { claimInvite } from '@/lib/events/invite-claim/actions';
import { cn } from '@/lib/utils';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

type ClaimCardProps = {
  inviteToken: string;
  event: {
    seriesSlug: string;
    editionSlug: string;
    seriesName: string;
    editionLabel: string;
    distanceLabel: string;
  };
  needsDob: boolean;
};

type ClaimFormValues = {
  dateOfBirth: string;
};

type ClaimResult = { registrationId: string };

export function ClaimInviteCard({ inviteToken, event, needsDob }: ClaimCardProps) {
  const t = useTranslations('pages.events.claim');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();

  const errorMap: Record<string, string> = {
    EMAIL_MISMATCH: t('errors.EMAIL_MISMATCH'),
    DOB_MISMATCH: t('errors.DOB_MISMATCH'),
    DOB_REQUIRED: t('errors.DOB_REQUIRED'),
    INVITE_EXPIRED: t('errors.INVITE_EXPIRED'),
    INVITE_INVALID: t('errors.INVITE_INVALID'),
    INVITE_CANCELLED: t('errors.INVITE_CANCELLED'),
    ALREADY_CLAIMED: t('errors.ALREADY_CLAIMED'),
    ALREADY_REGISTERED: t('errors.ALREADY_REGISTERED'),
    RATE_LIMITED: t('errors.RATE_LIMITED'),
    EMAIL_NOT_VERIFIED: t('errors.EMAIL_NOT_VERIFIED'),
    UNAUTHENTICATED: t('errors.UNAUTHENTICATED'),
  };

  const form = useForm<ClaimFormValues, ClaimResult>({
    defaultValues: { dateOfBirth: '' },
    onSubmit: async (values) => {
      if (needsDob && !values.dateOfBirth) {
        return {
          ok: false as const,
          error: 'INVALID_INPUT' as const,
          fieldErrors: { dateOfBirth: [t('errors.dobRequired')] },
          message: t('errors.dobRequired'),
        };
      }

      const result = await claimInvite({
        inviteToken,
        dateOfBirth: needsDob ? values.dateOfBirth : undefined,
      });

      if (!result.ok) {
        const message = errorMap[result.code] ?? result.error;
        return { ok: false as const, error: result.code ?? 'SERVER_ERROR', message };
      }

      return { ok: true as const, data: { registrationId: result.data.registrationId } };
    },
    onSuccess: (data) => {
      router.push({
        pathname: '/events/[seriesSlug]/[editionSlug]/register/complete/[registrationId]',
        params: {
          seriesSlug: event.seriesSlug,
          editionSlug: event.editionSlug,
          registrationId: data.registrationId,
        },
      });
    },
    onError: (message) => {
      toast.error(message);
    },
  });

  const dateOfBirthField = form.register('dateOfBirth');

  return (
    <PublicStatusShell
      badge="RunGoMX"
      icon={<CheckCircle2 className="h-5 w-5" />}
      title={t('title')}
      description={t('description')}
      context={
        <div className="space-y-1">
          <p className="font-display text-[1.35rem] font-medium tracking-[-0.03em] text-foreground">
            {event.seriesName} {event.editionLabel}
          </p>
          <p className={publicBodyTextClassName}>{event.distanceLabel}</p>
        </div>
      }
      surfaceClassName="max-w-3xl"
    >
      <Form form={form} className="space-y-5">
        <div className="space-y-2 text-left">
          <h2 className="font-display text-[clamp(1.7rem,3.1vw,2.2rem)] font-medium leading-[0.96] tracking-[-0.03em] text-foreground">
            {t('claimAction')}
          </h2>
          <p className={publicBodyTextClassName}>{needsDob ? t('dobLabel') : t('description')}</p>
        </div>

        <FormError />

        {needsDob ? (
          <FormField label={t('dobLabel')} required error={form.errors.dateOfBirth}>
            <DatePicker
              locale={locale}
              value={dateOfBirthField.value}
              onChangeAction={(value) => dateOfBirthField.onChange(value)}
              clearLabel={tCommon('clear')}
              name={dateOfBirthField.name as string}
              className={publicFieldClassName}
              disabled={form.isSubmitting}
            />
          </FormField>
        ) : (
          <div className={cn(publicMutedPanelClassName, 'space-y-1 p-4 sm:p-5')}>
            <p className="text-sm font-medium text-foreground">
              {event.seriesName} {event.editionLabel}
            </p>
            <p className={publicBodyTextClassName}>{event.distanceLabel}</p>
          </div>
        )}

        <div className={cn(publicPanelClassName, 'p-4 sm:p-5')}>
          <Button type="submit" disabled={form.isSubmitting} className="w-full">
            {form.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('claimAction')}
          </Button>
        </div>
      </Form>
    </PublicStatusShell>
  );
}
