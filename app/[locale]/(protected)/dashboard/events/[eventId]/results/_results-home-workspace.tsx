import { SafeNextDetailsMessage } from '@/components/results/primitives/safe-next-details-message';
import { ResultsStateRail } from '@/components/results/primitives/results-state-rail';
import { ResultsVersionVisibilityPanel } from '@/components/results/organizer/results-version-visibility-panel';
import { TableProResultsGrid } from '@/components/results/organizer/table-pro-results-grid';
import { Button } from '@/components/ui/button';
import { InsetSurface, MutedSurface, Surface } from '@/components/ui/surface';
import { Link } from '@/i18n/navigation';
import { ChevronRight } from 'lucide-react';

import { getResultsWorkspacePageData } from './_results-workspace';

type ResultsHomeWorkspaceProps = {
  eventId: string;
  pageData: Awaited<ReturnType<typeof getResultsWorkspacePageData>>;
  labels: {
    nextStepEyebrow: string;
    nextStepTitle: string;
    nextStepDescriptions: {
      syncPending: string;
      reviewDraft: string;
      readyToPublish: string;
      startIngestion: string;
    };
    draftSources: {
      title: string;
      description: string;
      captureTitle: string;
      captureDescription: string;
      importTitle: string;
      importDescription: string;
    };
    publishReadiness: {
      title: string;
      description: string;
    };
    draftSnapshot: {
      title: string;
      description: string;
    };
    supportingOps: {
      title: string;
      description: string;
      correctionsTitle: string;
      correctionsDescription: string;
      investigationTitle: string;
      investigationDescription: string;
    };
    actions: {
      capture: string;
      import: string;
      corrections: string;
      investigation: string;
    };
  };
};

function getPrimaryStepDescription(
  nextActionKey: ResultsHomeWorkspaceProps['pageData']['railState']['nextActionKey'],
  descriptions: ResultsHomeWorkspaceProps['labels']['nextStepDescriptions'],
) {
  switch (nextActionKey) {
    case 'syncPending':
      return descriptions.syncPending;
    case 'reviewDraft':
      return descriptions.reviewDraft;
    case 'readyToPublish':
      return descriptions.readyToPublish;
    default:
      return descriptions.startIngestion;
  }
}

function getNextActionLabel(pageData: ResultsHomeWorkspaceProps['pageData']) {
  switch (pageData.railState.nextActionKey) {
    case 'syncPending':
      return pageData.labels.stateRail.nextActionSyncPending;
    case 'reviewDraft':
      return pageData.labels.stateRail.nextActionReviewDraft;
    case 'readyToPublish':
      return pageData.labels.stateRail.nextActionReadyToPublish;
    default:
      return pageData.labels.stateRail.nextActionStartIngestion;
  }
}

export function ResultsHomeWorkspace({ eventId, pageData, labels }: ResultsHomeWorkspaceProps) {
  const primaryDescription = getPrimaryStepDescription(
    pageData.railState.nextActionKey,
    labels.nextStepDescriptions,
  );

  const creationCards = [
    {
      title: labels.draftSources.captureTitle,
      description: labels.draftSources.captureDescription,
      action: labels.actions.capture,
      href: {
        pathname: '/dashboard/events/[eventId]/results/capture',
        params: { eventId },
      } as const,
    },
    {
      title: labels.draftSources.importTitle,
      description: labels.draftSources.importDescription,
      action: labels.actions.import,
      href: {
        pathname: '/dashboard/events/[eventId]/results/import',
        params: { eventId },
      } as const,
    },
  ] as const;

  const supportingCards = [
    {
      title: labels.supportingOps.correctionsTitle,
      description: labels.supportingOps.correctionsDescription,
      action: labels.actions.corrections,
      href: {
        pathname: '/dashboard/events/[eventId]/results/corrections',
        params: { eventId },
      } as const,
    },
    {
      title: labels.supportingOps.investigationTitle,
      description: labels.supportingOps.investigationDescription,
      action: labels.actions.investigation,
      href: {
        pathname: '/dashboard/events/[eventId]/results/investigation',
        params: { eventId },
      } as const,
    },
  ] as const;

  return (
    <div className="space-y-6">
      <Surface className="space-y-4 p-5 sm:p-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
            {labels.nextStepEyebrow}
          </p>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {labels.nextStepTitle}
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">{primaryDescription}</p>
          </div>
        </div>

        {pageData.nextActionHref ? (
          <Button asChild size="lg" className="h-auto min-w-0 max-w-full px-5 py-3">
            <Link href={pageData.nextActionHref} className="min-w-0 !items-start gap-3">
              <span className="min-w-0 flex-1 break-words whitespace-normal text-left leading-snug">
                {getNextActionLabel(pageData)}
              </span>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
            </Link>
          </Button>
        ) : null}
      </Surface>

      <section className="space-y-3" aria-labelledby="results-draft-sources-title">
        <div className="space-y-1">
          <h2
            id="results-draft-sources-title"
            className="text-sm font-semibold text-foreground sm:text-base"
          >
            {labels.draftSources.title}
          </h2>
          <p className="text-sm text-muted-foreground">{labels.draftSources.description}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {creationCards.map((card) => (
            <Surface key={card.title} className="flex flex-col gap-3 p-4 sm:p-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground sm:text-base">{card.title}</h3>
                <p className="text-sm text-muted-foreground">{card.description}</p>
              </div>
              <div className="mt-auto">
                <Button asChild variant="outline" className="h-auto min-w-0 w-full px-5 py-3">
                  <Link href={card.href} className="min-w-0 !items-start !justify-between gap-3">
                    <span className="min-w-0 flex-1 break-words whitespace-normal text-left leading-snug">
                      {card.action}
                    </span>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
                  </Link>
                </Button>
              </div>
            </Surface>
          ))}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="results-publish-readiness-title">
        <div className="space-y-1">
          <h2
            id="results-publish-readiness-title"
            className="text-sm font-semibold text-foreground sm:text-base"
          >
            {labels.publishReadiness.title}
          </h2>
          <p className="text-sm text-muted-foreground">{labels.publishReadiness.description}</p>
        </div>
        <div className="grid gap-4">
          <ResultsStateRail
            state={pageData.railState}
            labels={pageData.labels.stateRail}
            nextActionHref={pageData.nextActionHref}
          />
          <ResultsVersionVisibilityPanel
            visibility={pageData.versionVisibility}
            labels={pageData.labels.versionVisibility}
          />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="results-draft-snapshot-title">
        <div className="space-y-1">
          <h2
            id="results-draft-snapshot-title"
            className="text-sm font-semibold text-foreground sm:text-base"
          >
            {labels.draftSnapshot.title}
          </h2>
          <p className="text-sm text-muted-foreground">{labels.draftSnapshot.description}</p>
        </div>
        <TableProResultsGrid
          rows={pageData.rows}
          densityStorageKey={pageData.densityStorageKey}
          labels={pageData.labels.table}
        />
      </section>

      {pageData.feedbackItems.length > 0 ? (
        <section className="space-y-3" aria-labelledby="results-guidance-title">
          <h2
            id="results-guidance-title"
            className="text-sm font-semibold text-foreground sm:text-base"
          >
            {pageData.labels.feedback.heading}
          </h2>
          <div className="grid gap-3">
            {pageData.feedbackItems.map((item) => (
              <MutedSurface key={item.id} className="p-0">
                <SafeNextDetailsMessage
                  safe={item.safe}
                  next={item.next}
                  details={item.details}
                  tone={item.tone}
                  labels={{
                    safe: pageData.labels.feedback.safe,
                    next: pageData.labels.feedback.next,
                    details: pageData.labels.feedback.details,
                  }}
                />
              </MutedSurface>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="results-supporting-ops-title">
        <div className="space-y-1">
          <h2
            id="results-supporting-ops-title"
            className="text-sm font-semibold text-foreground sm:text-base"
          >
            {labels.supportingOps.title}
          </h2>
          <p className="text-sm text-muted-foreground">{labels.supportingOps.description}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {supportingCards.map((card) => (
            <InsetSurface key={card.title} className="flex flex-col gap-3 p-4 sm:p-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">{card.title}</h3>
                <p className="text-sm text-muted-foreground">{card.description}</p>
              </div>
              <div className="mt-auto">
                <Button
                  asChild
                  variant="ghost"
                  className="h-auto min-w-0 w-full justify-start px-0 py-0 text-left"
                >
                  <Link href={card.href} className="min-w-0 !items-start gap-2 text-primary">
                    <span className="min-w-0 flex-1 break-words whitespace-normal leading-snug">
                      {card.action}
                    </span>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
                  </Link>
                </Button>
              </div>
            </InsetSurface>
          ))}
        </div>
      </section>
    </div>
  );
}
