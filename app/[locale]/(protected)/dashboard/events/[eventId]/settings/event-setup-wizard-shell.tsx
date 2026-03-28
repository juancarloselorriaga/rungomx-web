'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MutedSurface } from '@/components/ui/surface';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleDashed,
  SkipForward,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ComponentProps,
  startTransition,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useAssistantWorkspaceQueryState } from './event-assistant-workspace-state';

export type EventSetupWizardStepId =
  | 'basics'
  | 'distances'
  | 'pricing'
  | 'registration'
  | 'policies'
  | 'content'
  | 'extras'
  | 'review';

export type EventSetupWizardStep = {
  id: EventSetupWizardStepId;
  required: boolean;
  completed: boolean;
  content: ReactNode;
};

type ReviewIssue = {
  id: string;
  label: string;
  stepId: EventSetupWizardStepId;
  severity: 'required' | 'blocker' | 'optional';
  kind: 'publish' | 'required' | 'optional';
};

type EventSetupWizardShellProps = {
  eventId: string;
  eventName: string;
  organizationName: string;
  statusLabel: string;
  exitHref: ComponentProps<typeof Link>['href'];
  steps: EventSetupWizardStep[];
  reviewControls: ReactNode;
  reviewBlockers: ReviewIssue[];
  reviewRecommendations: ReviewIssue[];
  reviewPayloadToken: string;
  initialStepId?: EventSetupWizardStepId;
};

function readStepIdFromLocation(): EventSetupWizardStepId | undefined {
  if (typeof window === 'undefined') return undefined;

  const stepId = new URLSearchParams(window.location.search).get('step');
  switch (stepId) {
    case 'basics':
    case 'distances':
    case 'pricing':
    case 'registration':
    case 'policies':
    case 'content':
    case 'extras':
    case 'review':
      return stepId;
    default:
      return undefined;
  }
}

function readStoredStepId(storageKey: string): EventSetupWizardStepId | undefined {
  if (typeof window === 'undefined') return undefined;

  const storedStepId = window.sessionStorage.getItem(storageKey);
  switch (storedStepId) {
    case 'basics':
    case 'distances':
    case 'pricing':
    case 'registration':
    case 'policies':
    case 'content':
    case 'extras':
    case 'review':
      return storedStepId;
    default:
      return undefined;
  }
}

function resolveCanonicalStepIndex(
  steps: EventSetupWizardStep[],
  requestedStepId: EventSetupWizardStepId | undefined,
): number {
  if (!steps.length) return 0;

  const requestedIndex = requestedStepId
    ? steps.findIndex((step) => step.id === requestedStepId)
    : 0;
  const safeRequestedIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const requestedStep = steps[safeRequestedIndex];

  if (!requestedStep || requestedStep.id === 'review') {
    return safeRequestedIndex;
  }

  const firstIncompleteRequiredIndex = steps.findIndex(
    (step, index) => index < safeRequestedIndex && step.required && !step.completed,
  );

  return firstIncompleteRequiredIndex >= 0 ? firstIncompleteRequiredIndex : safeRequestedIndex;
}

function resolvePreferredStepId(
  storageKey: string,
  initialStepId: EventSetupWizardStepId | undefined,
  fallbackStepId: EventSetupWizardStepId | undefined,
): EventSetupWizardStepId | undefined {
  return (
    readStepIdFromLocation() ?? initialStepId ?? readStoredStepId(storageKey) ?? fallbackStepId
  );
}

function writeWizardStepToHistory(stepId: EventSetupWizardStepId, mode: 'push' | 'replace') {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.searchParams.set('wizard', '1');
  url.searchParams.set('step', stepId);

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl === currentUrl) return;

  if (mode === 'push') {
    window.history.pushState(window.history.state, '', nextUrl);
    return;
  }

  window.history.replaceState(window.history.state, '', nextUrl);
}

export function EventSetupWizardShell({
  eventId,
  eventName,
  organizationName,
  statusLabel,
  exitHref,
  steps,
  reviewControls,
  reviewBlockers,
  reviewRecommendations,
  reviewPayloadToken,
  initialStepId,
}: EventSetupWizardShellProps) {
  const t = useTranslations('pages.dashboardEventSettings');
  const router = useRouter();
  const { isOpen: isAssistantOpen, setOpen: setAssistantOpen } = useAssistantWorkspaceQueryState();
  const reviewControlsRef = useRef<HTMLDivElement>(null);
  const activeStepStorageKey = `event-setup-wizard:active-step:${eventId}`;
  const skippedStepsStorageKey = `event-setup-wizard:skipped:${eventId}`;
  const [activeStepIndex, setActiveStepIndex] = useState(() => {
    const preferredStepId = resolvePreferredStepId(
      activeStepStorageKey,
      initialStepId,
      steps[0]?.id,
    );
    return resolveCanonicalStepIndex(steps, preferredStepId);
  });
  const [skippedStepIds, setSkippedStepIds] = useState<EventSetupWizardStepId[]>(() => {
    if (typeof window === 'undefined') return [];

    const rawSkipped = window.sessionStorage.getItem(skippedStepsStorageKey);
    if (!rawSkipped) return [];

    try {
      const parsed = JSON.parse(rawSkipped);
      if (!Array.isArray(parsed)) return [];

      return parsed.filter((value): value is EventSetupWizardStepId =>
        steps.some((step) => step.id === value && !step.required),
      );
    } catch {
      window.sessionStorage.removeItem(skippedStepsStorageKey);
      return [];
    }
  });
  const sanitizedSkippedStepIds = skippedStepIds.filter((stepId) => {
    const step = steps.find((candidate) => candidate.id === stepId);
    return step && !step.required && !step.completed;
  });
  const [pendingReviewPayloadToken, setPendingReviewPayloadToken] = useState<string | null>(null);
  const activeStep = steps[activeStepIndex] ?? steps[0];
  const isReviewRefreshPending = activeStep?.id === 'review' && pendingReviewPayloadToken !== null;
  const publishBlockerCount = reviewBlockers.filter((issue) => issue.kind === 'publish').length;
  const setupBlockerCount = reviewBlockers.filter((issue) => issue.kind === 'required').length;
  const hasReviewRecommendations = reviewRecommendations.length > 0;
  const reviewState =
    reviewBlockers.length > 0
      ? 'blocked'
      : hasReviewRecommendations
        ? 'reviewRecommended'
        : 'ready';
  const totalCompletedSteps = steps.filter((step) => step.completed).length;
  const isLastStep = activeStepIndex === steps.length - 1;
  const canGoBack = activeStepIndex > 0;
  const isCurrentSatisfied =
    activeStep.completed || sanitizedSkippedStepIds.includes(activeStep.id);
  const firstIncompleteRequiredBeforeNext = steps
    .slice(0, Math.min(activeStepIndex + 1, steps.length - 1))
    .find((step) => step.required && !step.completed);
  const canAdvanceFromCurrent = !firstIncompleteRequiredBeforeNext;
  const canGoForward = !isLastStep && isCurrentSatisfied && canAdvanceFromCurrent;
  const showSkipAction =
    activeStepIndex < steps.length - 1 &&
    !activeStep.required &&
    !activeStep.completed &&
    !sanitizedSkippedStepIds.includes(activeStep.id) &&
    canAdvanceFromCurrent;
  const getStepLabel = (stepId: EventSetupWizardStepId) => t(`wizardShell.steps.${stepId}`);
  const getStepDescription = (stepId: EventSetupWizardStepId) => {
    switch (stepId) {
      case 'basics':
        return t('wizardShell.stepDescriptions.basics');
      case 'distances':
        return t('wizardShell.stepDescriptions.distances');
      case 'pricing':
        return t('wizardShell.stepDescriptions.pricing');
      case 'registration':
        return t('wizardShell.stepDescriptions.registration');
      case 'policies':
        return t('wizardShell.stepDescriptions.policies');
      case 'content':
        return t('wizardShell.stepDescriptions.content');
      case 'extras':
        return t('wizardShell.stepDescriptions.extras');
      case 'review':
        return t('wizardShell.stepDescriptions.review');
    }
  };

  const startReviewRefreshBoundary = useCallback(() => {
    setPendingReviewPayloadToken(reviewPayloadToken);
    startTransition(() => {
      router.refresh();
    });
  }, [reviewPayloadToken, router]);

  useEffect(() => {
    if (typeof window === 'undefined' || !activeStep) return;
    window.sessionStorage.setItem(activeStepStorageKey, activeStep.id);
  }, [activeStep, activeStepStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !activeStep) return;
    writeWizardStepToHistory(activeStep.id, 'replace');
  }, [activeStep]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(skippedStepsStorageKey, JSON.stringify(sanitizedSkippedStepIds));
  }, [sanitizedSkippedStepIds, skippedStepsStorageKey]);

  useEffect(() => {
    if (!activeStep || activeStep.id !== 'review') {
      if (pendingReviewPayloadToken !== null) {
        startTransition(() => {
          setPendingReviewPayloadToken(null);
        });
      }
      return;
    }

    if (pendingReviewPayloadToken !== null && reviewPayloadToken !== pendingReviewPayloadToken) {
      startTransition(() => {
        setPendingReviewPayloadToken(null);
      });
    }
  }, [activeStep, pendingReviewPayloadToken, reviewPayloadToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      const requestedStepId = readStepIdFromLocation() ?? steps[0]?.id;
      const canonicalIndex = resolveCanonicalStepIndex(steps, requestedStepId);
      const canonicalStep = steps[canonicalIndex];
      if (!canonicalStep) return;

      if (requestedStepId !== canonicalStep.id) {
        writeWizardStepToHistory(canonicalStep.id, 'replace');
      }

      if (canonicalStep.id === 'review' && activeStep?.id !== 'review') {
        startReviewRefreshBoundary();
      }

      setActiveStepIndex(canonicalIndex);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeStep, startReviewRefreshBoundary, steps]);

  const navigateToStep = (
    targetIndex: number,
    mode: 'push' | 'replace' = 'push',
    options?: { preserveRequestedStep?: boolean },
  ) => {
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    const targetStep = steps[targetIndex];
    if (!targetStep) return;
    const canonicalIndex = options?.preserveRequestedStep
      ? targetIndex
      : resolveCanonicalStepIndex(steps, targetStep.id);
    const canonicalStep = steps[canonicalIndex];
    if (!canonicalStep) return;

    if (canonicalStep.id === 'review' && activeStep?.id !== 'review') {
      startReviewRefreshBoundary();
    }

    writeWizardStepToHistory(canonicalStep.id, mode);
    setActiveStepIndex(canonicalIndex);
  };

  const handleNext = () => {
    if (!canGoForward) return;
    navigateToStep(Math.min(steps.length - 1, activeStepIndex + 1));
  };

  const handleSkip = () => {
    if (!showSkipAction) return;
    setSkippedStepIds((current) =>
      current.includes(activeStep.id) ? current : [...current, activeStep.id],
    );
    navigateToStep(Math.min(steps.length - 1, activeStepIndex + 1));
  };

  const blockedFooterLabel =
    activeStep.required && !isCurrentSatisfied
      ? t('wizardShell.footer.completeRequired', { step: getStepLabel(activeStep.id) })
      : firstIncompleteRequiredBeforeNext
        ? t('wizardShell.footer.completeRequired', {
            step: getStepLabel(firstIncompleteRequiredBeforeNext.id),
          })
        : showSkipAction
          ? t('wizardShell.footer.optionalHint')
          : t('wizardShell.footer.ready');

  const jumpToStep = (stepId: EventSetupWizardStepId) => {
    navigateToStep(
      steps.findIndex((step) => step.id === stepId),
      'push',
      { preserveRequestedStep: true },
    );
  };

  const scrollToReviewControls = () => {
    reviewControlsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-border/60 bg-background shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="border-b border-border/60 px-5 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {t('wizardShell.eyebrow')}
              </p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {t('wizardShell.title')}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                {t('wizardShell.description')}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="rounded-full border border-border/60 bg-muted/20 px-3 py-1 font-medium text-foreground">
                  {eventName}
                </span>
                <span>{organizationName}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <div className="rounded-full border border-border/60 bg-muted/20 px-3 py-1.5 text-sm font-medium text-foreground">
                <span className="text-muted-foreground">{t('wizardShell.progress.step')}</span>
                <span className="ml-2">{statusLabel}</span>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href={exitHref}>
                  <X className="mr-2 h-4 w-4" />
                  {t('wizardShell.navigation.exit')}
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="border-b border-border/60 px-5 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1240px] space-y-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0 max-w-3xl space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  {t('wizardShell.progress.label')}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-2xl">
                    {t('wizardShell.progress.current', {
                      current: activeStepIndex + 1,
                      total: steps.length,
                    })}
                  </p>
                  <span className="rounded-full border border-border/60 bg-muted/20 px-3 py-1 text-sm font-medium text-foreground">
                    {getStepLabel(activeStep.id)}
                  </span>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {getStepDescription(activeStep.id)}
                </p>
              </div>

              <dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3 xl:max-w-xl xl:text-right">
                <div className="space-y-1 rounded-2xl border border-border/50 bg-muted/15 px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('wizardShell.progress.completedLabel')}
                  </dt>
                  <dd>
                    <span className="font-semibold text-foreground">{totalCompletedSteps}</span>{' '}
                    <span>{t('wizardShell.progress.completedValue', { total: steps.length })}</span>
                  </dd>
                </div>
                <div className="space-y-1 rounded-2xl border border-border/50 bg-muted/15 px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('wizardShell.review.blockersTitle')}
                  </dt>
                  <dd>
                    {isReviewRefreshPending
                      ? t('wizardShell.review.recheckingCounts')
                      : t('wizardShell.progress.blockersValue', {
                          publish: publishBlockerCount,
                          required: setupBlockerCount,
                        })}
                  </dd>
                </div>
                <div className="space-y-1 rounded-2xl border border-border/50 bg-muted/15 px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('wizardShell.review.skippedTitle')}
                  </dt>
                  <dd>
                    {t('wizardShell.progress.skippedValue', {
                      count: sanitizedSkippedStepIds.length,
                    })}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="lg:hidden -mx-1 overflow-x-auto pb-1">
              <div className="flex min-w-max gap-2 px-1">
                {steps.map((step, index) => {
                  const isCurrent = index === activeStepIndex;
                  const isSkipped = sanitizedSkippedStepIds.includes(step.id);
                  const isComplete = step.completed;
                  const stateLabel = isComplete
                    ? t('wizardShell.sidebar.complete')
                    : isSkipped
                      ? t('wizardShell.sidebar.skipped')
                      : step.required
                        ? t('wizardShell.sidebar.required')
                        : t('wizardShell.sidebar.optional');

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => navigateToStep(index)}
                      className={cn(
                        'motion-pressable flex min-w-[170px] items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left sm:min-w-[190px]',
                        isCurrent
                          ? 'border-primary/30 bg-primary/5 shadow-sm'
                          : isComplete
                            ? 'border-border/70 bg-muted/20 hover:bg-muted/30'
                            : isSkipped
                              ? 'border-border/70 bg-muted/10 hover:bg-muted/20'
                              : 'border-border/70 bg-background hover:bg-muted/30',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                              isCurrent
                                ? 'bg-primary text-primary-foreground'
                                : isComplete
                                  ? 'bg-foreground text-background'
                                  : isSkipped
                                    ? 'bg-muted text-foreground'
                                    : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {getStepLabel(step.id)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">{stateLabel}</p>
                          </div>
                        </div>
                      </div>
                      {isComplete ? (
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-foreground" />
                      ) : isSkipped ? (
                        <SkipForward className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : isCurrent ? (
                        <Circle className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <CircleDashed className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="hidden flex-wrap gap-2 lg:flex">
              {steps.map((step, index) => {
                const isCurrent = index === activeStepIndex;
                const isSkipped = sanitizedSkippedStepIds.includes(step.id);
                const isComplete = step.completed;
                const stateLabel = isComplete
                  ? t('wizardShell.sidebar.complete')
                  : isSkipped
                    ? t('wizardShell.sidebar.skipped')
                    : step.required
                      ? t('wizardShell.sidebar.required')
                      : t('wizardShell.sidebar.optional');

                return (
                  <button
                    key={`${step.id}-desktop`}
                    type="button"
                    onClick={() => navigateToStep(index)}
                    className={cn(
                      'motion-pressable inline-flex items-center gap-3 rounded-full border px-3 py-2 text-left text-sm',
                      isCurrent
                        ? 'border-primary/30 bg-primary/5 shadow-sm'
                        : isComplete
                          ? 'border-border/70 bg-muted/20 hover:bg-muted/30'
                          : isSkipped
                            ? 'border-border/70 bg-muted/10 hover:bg-muted/20'
                            : 'border-border/70 bg-background hover:bg-muted/30',
                    )}
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-label={`${getStepLabel(step.id)} - ${stateLabel}`}
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                        isCurrent
                          ? 'bg-primary text-primary-foreground'
                          : isComplete
                            ? 'bg-foreground text-background'
                            : isSkipped
                              ? 'bg-muted text-foreground'
                              : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="font-medium text-foreground">{getStepLabel(step.id)}</span>
                    {isComplete ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-foreground" />
                    ) : isSkipped ? (
                      <SkipForward className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : isCurrent ? (
                      <Circle className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-6 sm:px-6 lg:px-8">
          <div
            key={activeStep.id}
            data-motion="settle"
            className={cn(
              'mx-auto',
              activeStep.id === 'review' ? 'max-w-[1280px]' : 'max-w-[1240px]',
            )}
          >
            {activeStep.id === 'review' ? (
              isReviewRefreshPending ? (
                <div className="space-y-6" data-motion-item aria-busy="true" aria-live="polite">
                  <div className="rounded-[28px] border border-primary/20 bg-primary/5 p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      {t('wizardShell.review.finishLineLabel')}
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold text-foreground">
                      {t('wizardShell.review.recheckingTitle')}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                      {t('wizardShell.review.recheckingDescription')}
                    </p>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      {t('wizardShell.review.serverAuthority')}
                    </p>
                    <div className="mt-5 grid gap-3 border-t border-border/50 pt-5 sm:grid-cols-3">
                      {[0, 1, 2].map((index) => (
                        <div key={`review-rechecking-count-${index}`} className="space-y-2">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-6 w-12" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-4 rounded-3xl border border-border/70 bg-background p-6">
                      <Skeleton className="h-6 w-52" />
                      <Skeleton className="h-4 w-full" />
                      <div className="space-y-3 pt-2">
                        <Skeleton className="h-[72px] w-full rounded-2xl" />
                        <Skeleton className="h-[72px] w-full rounded-2xl" />
                        <Skeleton className="h-[72px] w-full rounded-2xl" />
                      </div>
                    </div>
                    <div className="space-y-4 rounded-3xl border border-border/70 bg-background p-6">
                      <Skeleton className="h-6 w-56" />
                      <Skeleton className="h-4 w-full" />
                      <div className="space-y-3 pt-2">
                        <Skeleton className="h-[72px] w-full rounded-2xl" />
                        <Skeleton className="h-[72px] w-full rounded-2xl" />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border/70 bg-background/80 p-6">
                    <p className="sr-only">{t('wizardShell.review.recheckingBody')}</p>
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-11/12" />
                      <Skeleton className="h-4 w-8/12" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6" data-motion-item>
                  <div
                    className={cn(
                      'motion-status rounded-[28px] border p-6',
                      reviewState === 'ready'
                        ? 'border-border/60 bg-muted/15'
                        : reviewState === 'reviewRecommended'
                          ? 'border-border/60 bg-muted/15'
                          : 'border-destructive/20 bg-destructive/5',
                    )}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-2xl">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                          {t('wizardShell.review.finishLineLabel')}
                        </p>
                        <h2 className="mt-3 text-2xl font-semibold text-foreground">
                          {reviewState === 'ready'
                            ? t('wizardShell.review.readyTitle')
                            : reviewState === 'reviewRecommended'
                              ? t('wizardShell.review.reviewRecommendedTitle')
                              : t('wizardShell.review.blockedTitle')}
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {reviewState === 'ready'
                            ? t('wizardShell.review.readyDescription')
                            : reviewState === 'reviewRecommended'
                              ? t('wizardShell.review.reviewRecommendedDescription', {
                                  count: reviewRecommendations.length,
                                })
                              : t('wizardShell.review.blockedDescription', {
                                  publish: publishBlockerCount,
                                  required: setupBlockerCount,
                                })}
                        </p>
                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                          {t('wizardShell.review.serverAuthority')}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        {reviewBlockers.length > 0 ? (
                          <Button
                            type="button"
                            onClick={() => jumpToStep(reviewBlockers[0]!.stepId)}
                            className="motion-pressable"
                          >
                            {t('wizardShell.review.goToFirstBlocker')}
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        ) : (
                          <>
                            <Button type="button" onClick={scrollToReviewControls}>
                              {t('wizardShell.review.openPublishControls')}
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                            {isAssistantOpen ? (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setAssistantOpen(false)}
                              >
                                {t('wizardShell.review.closeAssistant')}
                              </Button>
                            ) : null}
                            <Button asChild type="button" variant="ghost">
                              <Link href={exitHref}>{t('wizardShell.navigation.exit')}</Link>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    <dl
                      className="mt-5 grid gap-3 border-t border-border/50 pt-5 text-sm text-muted-foreground sm:grid-cols-3"
                      data-motion="settle"
                    >
                      <div
                        className="space-y-1"
                        data-motion-item
                        style={{ '--motion-index': 0 } as React.CSSProperties}
                      >
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {t('wizardShell.review.blockersTitle')}
                        </dt>
                        <dd className="text-base font-semibold text-foreground">
                          {reviewBlockers.length}
                        </dd>
                      </div>
                      <div
                        className="space-y-1"
                        data-motion-item
                        style={{ '--motion-index': 1 } as React.CSSProperties}
                      >
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {t('wizardShell.review.recommendationsTitle')}
                        </dt>
                        <dd className="text-base font-semibold text-foreground">
                          {reviewRecommendations.length}
                        </dd>
                      </div>
                      <div
                        className="space-y-1"
                        data-motion-item
                        style={{ '--motion-index': 2 } as React.CSSProperties}
                      >
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {t('wizardShell.review.skippedTitle')}
                        </dt>
                        <dd className="text-base font-semibold text-foreground">
                          {sanitizedSkippedStepIds.length}
                        </dd>
                      </div>
                    </dl>

                    {reviewBlockers.length === 0 ? (
                      <MutedSurface className="mt-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {t('wizardShell.review.nextActionsLabel')}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {isAssistantOpen
                            ? t('wizardShell.review.savedStateHintWithAssistant')
                            : t('wizardShell.review.savedStateHint')}
                        </p>
                      </MutedSurface>
                    ) : null}
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-3xl border border-border/60 bg-background p-6">
                      <h2 className="text-lg font-semibold text-foreground">
                        {t('wizardShell.review.blockersTitle')}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t('wizardShell.review.blockersDescription')}
                      </p>
                      <div className="mt-4 space-y-3">
                        {reviewBlockers.length === 0 ? (
                          <div
                            className={cn(
                              'rounded-2xl border p-4 text-sm',
                              reviewState === 'ready'
                                ? 'border-border/60 bg-muted/20 text-foreground'
                                : 'border-border/60 bg-muted/20 text-foreground',
                            )}
                          >
                            {reviewState === 'ready'
                              ? t('wizardShell.review.noBlockers')
                              : t('wizardShell.review.noRequiredBlockers')}
                          </div>
                        ) : (
                          reviewBlockers.map((issue) => (
                            <button
                              key={issue.id}
                              type="button"
                              onClick={() => jumpToStep(issue.stepId)}
                              className="motion-pressable flex w-full items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-left hover:bg-destructive/10"
                            >
                              <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={cn(
                                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                                      issue.kind === 'publish'
                                        ? 'bg-destructive/10 text-destructive'
                                        : 'bg-muted text-foreground',
                                    )}
                                  >
                                    {issue.kind === 'publish'
                                      ? t('wizardShell.review.publishBadge')
                                      : t('wizardShell.review.requiredBadge')}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {getStepLabel(issue.stepId)}
                                  </span>
                                </span>
                                <span className="mt-1 block text-sm text-foreground">
                                  {issue.label}
                                </span>
                                <span className="mt-2 inline-flex items-center text-xs font-medium text-muted-foreground">
                                  {t('wizardShell.review.goToStep', {
                                    step: getStepLabel(issue.stepId),
                                  })}
                                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                                </span>
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-3xl border border-border/60 bg-background p-6">
                        <h2 className="text-lg font-semibold text-foreground">
                          {t('wizardShell.review.recommendationsTitle')}
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {t('wizardShell.review.recommendationsDescription')}
                        </p>
                        <div className="mt-4 space-y-3">
                          {reviewRecommendations.length === 0 ? (
                            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                              {t('wizardShell.review.noRecommendations')}
                            </div>
                          ) : (
                            reviewRecommendations.map((issue) => (
                              <button
                                key={issue.id}
                                type="button"
                                onClick={() => jumpToStep(issue.stepId)}
                                className="motion-pressable flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-background px-4 py-3 text-left hover:bg-muted/30"
                              >
                                <CircleDashed className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                <span className="min-w-0 flex-1">
                                  <span className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                      {t('wizardShell.review.recommendationBadge')}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {getStepLabel(issue.stepId)}
                                    </span>
                                  </span>
                                  <span className="mt-1 block text-sm text-foreground">
                                    {issue.label}
                                  </span>
                                  <span className="mt-2 inline-flex items-center text-xs font-medium text-muted-foreground">
                                    {t('wizardShell.review.goToStep', {
                                      step: getStepLabel(issue.stepId),
                                    })}
                                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                                  </span>
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-border/60 bg-background p-6">
                        <h2 className="text-lg font-semibold text-foreground">
                          {t('wizardShell.review.skippedTitle')}
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {t('wizardShell.review.skippedDescription')}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {sanitizedSkippedStepIds.length === 0 ? (
                            <span className="text-sm text-muted-foreground">
                              {t('wizardShell.review.noSkipped')}
                            </span>
                          ) : (
                            sanitizedSkippedStepIds.map((stepId) => (
                              <button
                                key={stepId}
                                type="button"
                                onClick={() => jumpToStep(stepId)}
                                className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/20 px-3 py-1 text-sm font-medium text-foreground"
                              >
                                <SkipForward className="h-3.5 w-3.5" />
                                <span>{getStepLabel(stepId)}</span>
                              </button>
                            ))
                          )}
                        </div>
                        {sanitizedSkippedStepIds.length > 0 ? (
                          <p className="mt-4 text-xs leading-5 text-muted-foreground">
                            {t('wizardShell.review.skippedHelp')}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div id="wizard-review-controls" ref={reviewControlsRef}>
                    {reviewControls}
                  </div>
                </div>
              )
            ) : (
              <div data-motion-item>{activeStep.content}</div>
            )}
          </div>
        </div>

        <div className="border-t border-border/60 px-6 py-5 sm:px-8">
          <div className="mx-auto flex max-w-[1240px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-muted-foreground">{blockedFooterLabel}</p>
            <div className="flex flex-wrap items-center gap-3">
              {showSkipAction ? (
                <Button type="button" variant="ghost" onClick={handleSkip}>
                  <SkipForward className="mr-2 h-4 w-4" />
                  {t('wizardShell.navigation.skip')}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => navigateToStep(Math.max(0, activeStepIndex - 1))}
                disabled={!canGoBack}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('wizardShell.navigation.previous')}
              </Button>
              {!isLastStep ? (
                <Button type="button" onClick={handleNext} disabled={!canGoForward}>
                  {t('wizardShell.navigation.next')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
