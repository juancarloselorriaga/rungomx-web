'use client';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { useState } from 'react';

type TrustAuditActionOption = {
  value: string;
  label: string;
};

type ResultsInvestigationAuditFiltersFormProps = {
  locale: string;
  fromVersionId: string;
  toVersionId: string;
  auditAction?: string;
  auditFrom?: string;
  auditTo?: string;
  clearLabel: string;
  labels: {
    action: string;
    allActions: string;
    from: string;
    to: string;
    apply: string;
  };
  actionOptions: readonly TrustAuditActionOption[];
};

export function ResultsInvestigationAuditFiltersForm({
  locale,
  fromVersionId,
  toVersionId,
  auditAction,
  auditFrom,
  auditTo,
  clearLabel,
  labels,
  actionOptions,
}: ResultsInvestigationAuditFiltersFormProps) {
  const [fromValue, setFromValue] = useState(auditFrom ?? '');
  const [toValue, setToValue] = useState(auditTo ?? '');

  return (
    <form className="mt-3 grid gap-3 md:grid-cols-4" method="get">
      <input type="hidden" name="fromVersionId" value={fromVersionId} />
      <input type="hidden" name="toVersionId" value={toVersionId} />

      <label className="grid gap-1 text-xs text-muted-foreground">
        <span>{labels.action}</span>
        <select
          name="auditAction"
          defaultValue={auditAction ?? ''}
          className="h-11 sm:h-10 rounded-md border bg-background px-3 text-sm text-foreground outline-none ring-0 transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <option value="">{labels.allActions}</option>
          {actionOptions.map((action) => (
            <option key={action.value} value={action.value}>
              {action.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-1 text-xs text-muted-foreground">
        <span>{labels.from}</span>
        <DatePicker
          name="auditFrom"
          value={fromValue}
          onChangeAction={setFromValue}
          locale={locale}
          clearLabel={clearLabel}
        />
      </div>

      <div className="grid gap-1 text-xs text-muted-foreground">
        <span>{labels.to}</span>
        <DatePicker
          name="auditTo"
          value={toValue}
          onChangeAction={setToValue}
          locale={locale}
          clearLabel={clearLabel}
        />
      </div>

      <div className="flex items-end">
        <Button type="submit" className="min-w-0">
          {labels.apply}
        </Button>
      </div>
    </form>
  );
}

