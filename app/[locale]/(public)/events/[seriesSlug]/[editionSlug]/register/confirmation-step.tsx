import { CheckCircle, Download, FileText } from 'lucide-react';

import { MarkdownContent } from '@/components/markdown/markdown-content';
import {
  publicMutedPanelClassName,
  publicPanelClassName,
} from '@/components/common/public-form-styles';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { formatRegistrationTicketCode } from '@/lib/events/tickets';
import { cn } from '@/lib/utils';

type EventDocument = {
  label: string;
  url: string;
};

type ConfirmationLabels = {
  title: string;
  description: string;
  registrationId: string;
  distance: string;
  whatNext: string;
  nextSteps: string;
  documents: string;
  policiesTitle: string;
  refundPolicy: string;
  transferPolicy: string;
  deferralPolicy: string;
  viewEvent: string;
  backToEvents: string;
};

type ConfirmationStepProps = {
  locale: string;
  timezone: string;
  registrationId: string | null;
  selectedDistanceLabel: string | null;
  documents: EventDocument[];
  seriesSlug: string;
  editionSlug: string;
  policyConfig: {
    refundsAllowed: boolean;
    refundPolicyText: string | null;
    refundDeadline: Date | null;
    transfersAllowed: boolean;
    transferPolicyText: string | null;
    transferDeadline: Date | null;
    deferralsAllowed: boolean;
    deferralPolicyText: string | null;
    deferralDeadline: Date | null;
  } | null;
  labels: ConfirmationLabels;
};

export function ConfirmationStep({
  locale,
  timezone,
  registrationId,
  selectedDistanceLabel,
  documents,
  seriesSlug,
  editionSlug,
  policyConfig,
  labels,
}: ConfirmationStepProps) {
  return (
    <div className="space-y-8 py-3">
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10">
          <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>

        <div>
          <h2 className="font-display text-[clamp(1.9rem,3.5vw,2.7rem)] font-medium leading-[0.95] tracking-[-0.035em] text-foreground">
            {labels.title}
          </h2>
          <p className="mx-auto mt-3 max-w-[38rem] text-sm leading-7 text-muted-foreground sm:text-[0.98rem]">
            {labels.description}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {registrationId ? (
          <div className={publicPanelClassName}>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {labels.registrationId}
            </p>
            <p className="mt-3 font-mono text-base font-semibold text-foreground">
              {formatRegistrationTicketCode(registrationId)}
            </p>
          </div>
        ) : null}

        {selectedDistanceLabel ? (
          <div className={publicPanelClassName}>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {labels.distance}
            </p>
            <p className="font-display mt-3 text-[1.45rem] font-medium tracking-[-0.03em] text-foreground">
              {selectedDistanceLabel}
            </p>
          </div>
        ) : null}
      </div>

      <div className={publicMutedPanelClassName}>
        <h3 className="font-medium text-foreground">{labels.whatNext}</h3>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">{labels.nextSteps}</p>
      </div>

      {documents.length > 0 && (
        <div className={cn(publicPanelClassName, 'space-y-3 text-left')}>
          <h3 className="flex items-center gap-2 font-medium">
            <FileText className="h-4 w-4" />
            {labels.documents}
          </h3>
          <div className="space-y-2">
            {documents.map((doc, index) => (
              <a
                key={index}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-[1rem] border border-border/40 bg-background/88 p-3 transition-colors hover:border-primary/30 hover:bg-background"
              >
                <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="text-sm font-medium flex-1">{doc.label}</span>
                <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
              </a>
            ))}
          </div>
        </div>
      )}

      {policyConfig && (
        <div className={cn(publicPanelClassName, 'space-y-3 text-left')}>
          <h3 className="font-medium">{labels.policiesTitle}</h3>
          <PolicySummary
            locale={locale}
            timezone={timezone}
            label={labels.refundPolicy}
            enabled={policyConfig.refundsAllowed}
            text={policyConfig.refundPolicyText}
            deadline={policyConfig.refundDeadline}
          />
          <PolicySummary
            locale={locale}
            timezone={timezone}
            label={labels.transferPolicy}
            enabled={policyConfig.transfersAllowed}
            text={policyConfig.transferPolicyText}
            deadline={policyConfig.transferDeadline}
          />
          <PolicySummary
            locale={locale}
            timezone={timezone}
            label={labels.deferralPolicy}
            enabled={policyConfig.deferralsAllowed}
            text={policyConfig.deferralPolicyText}
            deadline={policyConfig.deferralDeadline}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-center">
        <Button asChild className="min-w-0">
          <Link
            href={{
              pathname: '/events/[seriesSlug]/[editionSlug]',
              params: { seriesSlug, editionSlug },
            }}
          >
            {labels.viewEvent}
          </Link>
        </Button>
        <Button variant="outline" asChild className="min-w-0">
          <Link href="/events">{labels.backToEvents}</Link>
        </Button>
      </div>
    </div>
  );
}

function PolicySummary({
  locale,
  timezone,
  label,
  enabled,
  text,
  deadline,
}: {
  locale: string;
  timezone: string;
  label: string;
  enabled: boolean;
  text: string | null;
  deadline: Date | null;
}) {
  if (!enabled && !text && !deadline) {
    return null;
  }

  const deadlineText = deadline
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: timezone,
      }).format(new Date(deadline))
    : null;

  return (
    <div className="text-sm text-muted-foreground space-y-1">
      <p className="font-medium text-foreground">{label}</p>
      {text ? (
        <MarkdownContent content={text} className="text-sm text-muted-foreground [&_p]:m-0" />
      ) : null}
      {deadlineText && <p>{deadlineText}</p>}
    </div>
  );
}
