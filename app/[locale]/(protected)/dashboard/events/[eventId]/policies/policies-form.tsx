'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { updateEventPolicyConfig } from '@/lib/events/actions';
import type { EventPolicyConfig } from '@/lib/events/queries';
import { Loader2, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type PoliciesFormProps = {
  eventId: string;
  initialPolicies: EventPolicyConfig | null;
};

export function PoliciesForm({ eventId, initialPolicies }: PoliciesFormProps) {
  const t = useTranslations('pages.dashboard.events.policies');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [refundsAllowed, setRefundsAllowed] = useState(initialPolicies?.refundsAllowed ?? false);
  const [refundPolicyText, setRefundPolicyText] = useState(initialPolicies?.refundPolicyText ?? '');
  const [refundDeadline, setRefundDeadline] = useState(
    initialPolicies?.refundDeadline ? formatDateTimeForInput(initialPolicies.refundDeadline) : '',
  );

  const [transfersAllowed, setTransfersAllowed] = useState(initialPolicies?.transfersAllowed ?? false);
  const [transferPolicyText, setTransferPolicyText] = useState(initialPolicies?.transferPolicyText ?? '');
  const [transferDeadline, setTransferDeadline] = useState(
    initialPolicies?.transferDeadline ? formatDateTimeForInput(initialPolicies.transferDeadline) : '',
  );

  const [deferralsAllowed, setDeferralsAllowed] = useState(initialPolicies?.deferralsAllowed ?? false);
  const [deferralPolicyText, setDeferralPolicyText] = useState(initialPolicies?.deferralPolicyText ?? '');
  const [deferralDeadline, setDeferralDeadline] = useState(
    initialPolicies?.deferralDeadline ? formatDateTimeForInput(initialPolicies.deferralDeadline) : '',
  );

  async function handleSave() {
    setError(null);

    startTransition(async () => {
      const result = await updateEventPolicyConfig({
        editionId: eventId,
        refundsAllowed,
        refundPolicyText: refundPolicyText || null,
        refundDeadline: refundDeadline ? new Date(refundDeadline).toISOString() : null,
        transfersAllowed,
        transferPolicyText: transferPolicyText || null,
        transferDeadline: transferDeadline ? new Date(transferDeadline).toISOString() : null,
        deferralsAllowed,
        deferralPolicyText: deferralPolicyText || null,
        deferralDeadline: deferralDeadline ? new Date(deferralDeadline).toISOString() : null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <PolicySection
        title={t('refund.title')}
        description={t('refund.description')}
        enabled={refundsAllowed}
        onToggle={setRefundsAllowed}
        policyLabel={t('refund.textLabel')}
        policyValue={refundPolicyText}
        onPolicyChange={setRefundPolicyText}
        deadlineLabel={t('refund.deadlineLabel')}
        deadlineValue={refundDeadline}
        onDeadlineChange={setRefundDeadline}
        disabled={isPending}
      />

      <PolicySection
        title={t('transfer.title')}
        description={t('transfer.description')}
        enabled={transfersAllowed}
        onToggle={setTransfersAllowed}
        policyLabel={t('transfer.textLabel')}
        policyValue={transferPolicyText}
        onPolicyChange={setTransferPolicyText}
        deadlineLabel={t('transfer.deadlineLabel')}
        deadlineValue={transferDeadline}
        onDeadlineChange={setTransferDeadline}
        disabled={isPending}
      />

      <PolicySection
        title={t('deferral.title')}
        description={t('deferral.description')}
        enabled={deferralsAllowed}
        onToggle={setDeferralsAllowed}
        policyLabel={t('deferral.textLabel')}
        policyValue={deferralPolicyText}
        onPolicyChange={setDeferralPolicyText}
        deadlineLabel={t('deferral.deadlineLabel')}
        deadlineValue={deferralDeadline}
        onDeadlineChange={setDeferralDeadline}
        disabled={isPending}
      />

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          {t('save')}
        </Button>
      </div>
    </div>
  );
}

type PolicySectionProps = {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  policyLabel: string;
  policyValue: string;
  onPolicyChange: (value: string) => void;
  deadlineLabel: string;
  deadlineValue: string;
  onDeadlineChange: (value: string) => void;
  disabled: boolean;
};

function PolicySection({
  title,
  description,
  enabled,
  onToggle,
  policyLabel,
  policyValue,
  onPolicyChange,
  deadlineLabel,
  deadlineValue,
  onDeadlineChange,
  disabled,
}: PolicySectionProps) {
  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} disabled={disabled} />
      </div>

      <FormField label={policyLabel}>
        <textarea
          value={policyValue}
          onChange={(event) => onPolicyChange(event.target.value)}
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 resize-none"
          disabled={!enabled || disabled}
        />
      </FormField>

      <FormField label={deadlineLabel}>
        <input
          type="datetime-local"
          value={deadlineValue}
          onChange={(event) => onDeadlineChange(event.target.value)}
          className="w-full max-w-xs rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          disabled={!enabled || disabled}
        />
      </FormField>
    </section>
  );
}

function formatDateTimeForInput(date: Date): string {
  return date.toISOString().slice(0, 16);
}
