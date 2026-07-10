'use client';

import { Button } from '@/components/ui/button';
import { InsetSurface, Surface } from '@/components/ui/surface';
import { requestRunnerResultCorrection } from '@/lib/events/results/actions';
import { RESULT_ENTRY_STATUSES } from '@/lib/events/results/status';
import { parseResultFinishTimeToMillis } from '@/lib/events/results/ingestion/validation';
import { useMemo, useState, useTransition } from 'react';

// Boundary-safe prop shape (no DB-coupled imports): the server page maps its query rows
// into this before passing them down.
export type CorrectionRequestEntryOption = {
  entryId: string;
  runnerFullName: string;
  bibNumber: string | null;
  distanceLabel: string | null;
  status: (typeof RESULT_ENTRY_STATUSES)[number];
  finishTimeMillis: number | null;
  gender: string | null;
  age: number | null;
};

type CorrectionRequestFormLabels = {
  title: string;
  description: string;
  entryLabel: string;
  entryPlaceholder: string;
  emptyEntries: string;
  runnerLabel: string;
  bibLabel: string;
  genderLabel: string;
  ageLabel: string;
  statusLabel: string;
  finishTimeLabel: string;
  finishTimeHint: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  submitAction: string;
  submitPending: string;
  successMessage: string;
  failurePrefix: string;
  noChangesMessage: string;
  reasonRequiredMessage: string;
  statusOptions: Record<(typeof RESULT_ENTRY_STATUSES)[number], string>;
};

type CorrectionRequestFormProps = {
  entries: CorrectionRequestEntryOption[];
  labels: CorrectionRequestFormLabels;
};

function formatFinishTime(milliseconds: number | null): string {
  if (milliseconds === null || milliseconds <= 0) return '';
  const totalSeconds = Math.round(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function CorrectionRequestForm({ entries, labels }: CorrectionRequestFormProps) {
  const [isPending, startTransition] = useTransition();
  const [entryId, setEntryId] = useState('');
  const [runnerFullName, setRunnerFullName] = useState('');
  const [bibNumber, setBibNumber] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [status, setStatus] = useState<(typeof RESULT_ENTRY_STATUSES)[number]>('finish');
  const [finishTime, setFinishTime] = useState('');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null,
  );

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.entryId === entryId) ?? null,
    [entries, entryId],
  );

  const applyEntry = (nextEntryId: string) => {
    setEntryId(nextEntryId);
    setFeedback(null);
    const entry = entries.find((item) => item.entryId === nextEntryId) ?? null;
    setRunnerFullName(entry?.runnerFullName ?? '');
    setBibNumber(entry?.bibNumber ?? '');
    setGender(entry?.gender ?? '');
    setAge(entry?.age !== null && entry?.age !== undefined ? String(entry.age) : '');
    setStatus(entry?.status ?? 'finish');
    setFinishTime(formatFinishTime(entry?.finishTimeMillis ?? null));
  };

  const onSubmit = () => {
    if (!selectedEntry) return;
    if (!reason.trim()) {
      setFeedback({ tone: 'error', message: labels.reasonRequiredMessage });
      return;
    }

    // Build a patch of only the fields the organizer actually changed.
    const patch: Record<string, unknown> = {};
    const trimmedName = runnerFullName.trim();
    if (trimmedName && trimmedName !== selectedEntry.runnerFullName) {
      patch.runnerFullName = trimmedName;
    }
    const trimmedBib = bibNumber.trim();
    if ((trimmedBib || null) !== (selectedEntry.bibNumber ?? null)) {
      patch.bibNumber = trimmedBib || null;
    }
    const trimmedGender = gender.trim();
    if ((trimmedGender || null) !== (selectedEntry.gender ?? null)) {
      patch.gender = trimmedGender || null;
    }
    const parsedAge = age.trim() ? Number.parseInt(age.trim(), 10) : null;
    const normalizedAge = parsedAge !== null && Number.isFinite(parsedAge) ? parsedAge : null;
    if (normalizedAge !== (selectedEntry.age ?? null)) {
      patch.age = normalizedAge;
    }
    if (status !== selectedEntry.status) {
      patch.status = status;
    }
    const parsedFinish = finishTime.trim()
      ? parseResultFinishTimeToMillis(finishTime.trim())
      : null;
    if (status === 'finish' && parsedFinish !== selectedEntry.finishTimeMillis) {
      patch.finishTimeMillis = parsedFinish;
    }

    if (Object.keys(patch).length === 0) {
      setFeedback({ tone: 'error', message: labels.noChangesMessage });
      return;
    }

    startTransition(async () => {
      const result = await requestRunnerResultCorrection({
        entryId: selectedEntry.entryId,
        reason: reason.trim(),
        requestContext: { correctionPatch: patch },
      });

      if (result.ok) {
        setFeedback({ tone: 'success', message: labels.successMessage });
        setReason('');
        return;
      }

      setFeedback({ tone: 'error', message: `${labels.failurePrefix} ${result.error}` });
    });
  };

  return (
    <Surface className="space-y-4 p-4 sm:p-5">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground sm:text-base">{labels.title}</h3>
        <p className="text-xs text-muted-foreground sm:text-sm">{labels.description}</p>
      </header>

      {entries.length === 0 ? (
        <InsetSurface className="bg-muted/25 px-3 py-2">
          <p className="text-sm text-muted-foreground">{labels.emptyEntries}</p>
        </InsetSurface>
      ) : (
        <div className="space-y-3">
          <label className="space-y-1 block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {labels.entryLabel}
            </span>
            <select
              value={entryId}
              onChange={(event) => applyEntry(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
              aria-label={labels.entryLabel}
            >
              <option value="">{labels.entryPlaceholder}</option>
              {entries.map((entry) => (
                <option key={entry.entryId} value={entry.entryId}>
                  {[
                    entry.bibNumber ? `#${entry.bibNumber}` : null,
                    entry.runnerFullName,
                    entry.distanceLabel,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </option>
              ))}
            </select>
          </label>

          {selectedEntry ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {labels.runnerLabel}
                </span>
                <input
                  value={runnerFullName}
                  onChange={(event) => setRunnerFullName(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {labels.bibLabel}
                </span>
                <input
                  value={bibNumber}
                  onChange={(event) => setBibNumber(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {labels.genderLabel}
                </span>
                <input
                  value={gender}
                  onChange={(event) => setGender(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {labels.ageLabel}
                </span>
                <input
                  value={age}
                  inputMode="numeric"
                  onChange={(event) => setAge(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {labels.statusLabel}
                </span>
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as (typeof RESULT_ENTRY_STATUSES)[number])
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {RESULT_ENTRY_STATUSES.map((statusOption) => (
                    <option key={statusOption} value={statusOption}>
                      {labels.statusOptions[statusOption]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {labels.finishTimeLabel}
                </span>
                <input
                  value={finishTime}
                  onChange={(event) => setFinishTime(event.target.value)}
                  placeholder="HH:MM:SS"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                />
                <span className="text-xs text-muted-foreground">{labels.finishTimeHint}</span>
              </label>
            </div>
          ) : null}

          {selectedEntry ? (
            <label className="space-y-1 block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {labels.reasonLabel}
              </span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                placeholder={labels.reasonPlaceholder}
                className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          ) : null}

          {selectedEntry ? (
            <Button
              type="button"
              onClick={onSubmit}
              disabled={isPending}
              data-testid="results-correction-request-submit"
            >
              {isPending ? labels.submitPending : labels.submitAction}
            </Button>
          ) : null}

          {feedback ? (
            <p
              className={
                feedback.tone === 'success'
                  ? 'rounded-md border border-emerald-300/60 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100'
                  : 'rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
              }
            >
              {feedback.message}
            </p>
          ) : null}
        </div>
      )}
    </Surface>
  );
}
