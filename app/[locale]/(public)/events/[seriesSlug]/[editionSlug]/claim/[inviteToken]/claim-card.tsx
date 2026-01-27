'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { useRouter } from '@/i18n/navigation';
import { Form, FormError, useForm } from '@/lib/forms';
import { claimInvite } from '@/lib/events/invite-claim/actions';
import { cn } from '@/lib/utils';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
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

  return (
    <div className="container mx-auto px-4 py-16 max-w-lg">
      <Form form={form} className="rounded-lg border bg-card p-8 shadow-sm text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
          <p className="text-sm text-muted-foreground">
            {event.seriesName} {event.editionLabel} · {event.distanceLabel}
          </p>
        </div>

        <FormError />

        {needsDob ? (
          <div className="text-left">
            <FormField label={t('dobLabel')} required error={form.errors.dateOfBirth}>
              <input
                type="date"
                className={cn(
                  'w-full rounded-md border bg-background px-3 py-2 text-sm',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30',
                )}
                {...form.register('dateOfBirth')}
                disabled={form.isSubmitting}
              />
            </FormField>
          </div>
        ) : null}

        <Button type="submit" disabled={form.isSubmitting} className="w-full">
          {form.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {t('claimAction')}
        </Button>
      </Form>
    </div>
  );
}
