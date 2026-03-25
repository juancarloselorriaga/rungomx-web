import { CheckCircle, Download, FileText } from 'lucide-react';

import { MarkdownContent } from '@/components/markdown/markdown-content';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { formatRegistrationTicketCode } from '@/lib/events/tickets';

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
    <div className="text-center space-y-6 py-6">
      <div className="mx-auto h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
        <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
      </div>

      <div>
        <h2 className="text-2xl font-bold">{labels.title}</h2>
        <p className="text-muted-foreground mt-2">{labels.description}</p>
      </div>

      {registrationId && (
        <div className="rounded-lg bg-muted/50 p-4 text-sm">
          <p className="text-muted-foreground">{labels.registrationId}</p>
          <p className="font-mono font-semibold">
            {formatRegistrationTicketCode(registrationId)}
          </p>
        </div>
      )}

      {selectedDistanceLabel && (
        <div className="text-sm">
          <span className="text-muted-foreground">{labels.distance}: </span>
          <span className="font-medium">{selectedDistanceLabel}</span>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="font-medium">{labels.whatNext}</h3>
        <p className="text-sm text-muted-foreground">{labels.nextSteps}</p>
      </div>

      {documents.length > 0 && (
        <div className="rounded-lg border bg-muted/40 p-4 text-left space-y-3">
          <h3 className="font-medium flex items-center gap-2">
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
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors group"
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
        <div className="rounded-lg border bg-muted/40 p-4 text-left space-y-3">
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

      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
        <Button asChild>
          <Link
            href={{
              pathname: '/events/[seriesSlug]/[editionSlug]',
              params: { seriesSlug, editionSlug },
            }}
          >
            {labels.viewEvent}
          </Link>
        </Button>
        <Button variant="outline" asChild>
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
