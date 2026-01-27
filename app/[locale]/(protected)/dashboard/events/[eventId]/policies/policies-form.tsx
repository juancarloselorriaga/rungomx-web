'use client';

import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { updateEventPolicyConfig } from '@/lib/events/actions';
import type { EventPolicyConfig } from '@/lib/events/queries';
import { Form, FormError, useForm } from '@/lib/forms';
import { Loader2, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type PoliciesFormProps = {
  eventId: string;
  initialPolicies: EventPolicyConfig | null;
};

type PolicyFormValues = {
  refundsAllowed: boolean;
  refundPolicyText: string;
  refundDeadline: string;
  transfersAllowed: boolean;
  transferPolicyText: string;
  transferDeadline: string;
  deferralsAllowed: boolean;
  deferralPolicyText: string;
  deferralDeadline: string;
};

function toFormValues(policies: EventPolicyConfig | null): PolicyFormValues {
  return {
    refundsAllowed: policies?.refundsAllowed ?? false,
    refundPolicyText: policies?.refundPolicyText ?? '',
    refundDeadline: policies?.refundDeadline ? formatDateTimeForInput(policies.refundDeadline) : '',
    transfersAllowed: policies?.transfersAllowed ?? false,
    transferPolicyText: policies?.transferPolicyText ?? '',
    transferDeadline: policies?.transferDeadline ? formatDateTimeForInput(policies.transferDeadline) : '',
    deferralsAllowed: policies?.deferralsAllowed ?? false,
    deferralPolicyText: policies?.deferralPolicyText ?? '',
    deferralDeadline: policies?.deferralDeadline ? formatDateTimeForInput(policies.deferralDeadline) : '',
  };
}

export function PoliciesForm({ eventId, initialPolicies }: PoliciesFormProps) {
  const t = useTranslations('pages.dashboardEvents.policies');
  const router = useRouter();

  const form = useForm<PolicyFormValues, null>({
    defaultValues: toFormValues(initialPolicies),
    onSubmit: async (values) => {
      const result = await updateEventPolicyConfig({
        editionId: eventId,
        refundsAllowed: values.refundsAllowed,
        refundPolicyText: values.refundPolicyText || null,
        refundDeadline: values.refundDeadline ? new Date(values.refundDeadline).toISOString() : null,
        transfersAllowed: values.transfersAllowed,
        transferPolicyText: values.transferPolicyText || null,
        transferDeadline: values.transferDeadline ? new Date(values.transferDeadline).toISOString() : null,
        deferralsAllowed: values.deferralsAllowed,
        deferralPolicyText: values.deferralPolicyText || null,
        deferralDeadline: values.deferralDeadline ? new Date(values.deferralDeadline).toISOString() : null,
      });

      if (!result.ok) {
        return {
          ok: false,
          error: result.code ?? 'SERVER_ERROR',
          message: result.error ?? t('errorSaving'),
        };
      }

      return { ok: true, data: null };
    },
    onSuccess: () => {
      toast.success(t('saved'));
      router.refresh();
    },
  });

  return (
    <Form form={form} className="space-y-6">
      <FormError />

      <PolicySection
        title={t('refund.title')}
        description={t('refund.description')}
        enabledKey="refundsAllowed"
        policyKey="refundPolicyText"
        deadlineKey="refundDeadline"
        policyLabel={t('refund.textLabel')}
        deadlineLabel={t('refund.deadlineLabel')}
        form={form}
      />

      <PolicySection
        title={t('transfer.title')}
        description={t('transfer.description')}
        enabledKey="transfersAllowed"
        policyKey="transferPolicyText"
        deadlineKey="transferDeadline"
        policyLabel={t('transfer.textLabel')}
        deadlineLabel={t('transfer.deadlineLabel')}
        form={form}
      />

      <PolicySection
        title={t('deferral.title')}
        description={t('deferral.description')}
        enabledKey="deferralsAllowed"
        policyKey="deferralPolicyText"
        deadlineKey="deferralDeadline"
        policyLabel={t('deferral.textLabel')}
        deadlineLabel={t('deferral.deadlineLabel')}
        form={form}
      />

      <div className="flex justify-end">
        <Button type="submit" disabled={form.isSubmitting}>
          {form.isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {t('save')}
        </Button>
      </div>
    </Form>
  );
}

type PolicySectionProps = {
  title: string;
  description: string;
  enabledKey: keyof PolicyFormValues;
  policyKey: keyof PolicyFormValues;
  deadlineKey: keyof PolicyFormValues;
  policyLabel: string;
  deadlineLabel: string;
  form: ReturnType<typeof useForm<PolicyFormValues, null>>;
};

function PolicySection({
  title,
  description,
  enabledKey,
  policyKey,
  deadlineKey,
  policyLabel,
  deadlineLabel,
  form,
}: PolicySectionProps) {
  const enabled = form.values[enabledKey] as boolean;
  const policyValue = form.values[policyKey] as string;
  const deadlineValue = form.values[deadlineKey] as string;

  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(value) => form.setFieldValue(enabledKey, value as never)}
          disabled={form.isSubmitting}
        />
      </div>

      <FormField label={policyLabel} error={form.errors[policyKey]}>
        <textarea
          value={policyValue}
          onChange={(event) => form.setFieldValue(policyKey, event.target.value as never)}
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 resize-none"
          disabled={!enabled || form.isSubmitting}
        />
      </FormField>

      <FormField label={deadlineLabel} error={form.errors[deadlineKey]}>
        <DateTimePicker
          value={deadlineValue}
          onChangeAction={(v) => form.setFieldValue(deadlineKey, v as never)}
          disabled={!enabled || form.isSubmitting}
          className="max-w-xs"
        />
      </FormField>
    </section>
  );
}

function formatDateTimeForInput(date: Date): string {
  return date.toISOString().slice(0, 16);
}
