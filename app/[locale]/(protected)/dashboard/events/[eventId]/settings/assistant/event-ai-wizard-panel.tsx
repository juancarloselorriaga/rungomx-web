'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

import { useAssistantWorkspaceQueryState } from '../event-assistant-workspace-state';
import { useEventAiWizardBrief } from './use-event-ai-wizard-brief';
import { useEventAiWizardContinuity } from './use-event-ai-wizard-continuity';
import { useEventAiWizardProposalView } from './use-event-ai-wizard-proposal-view';
import { useEventAiWizardTransport } from './use-event-ai-wizard-transport';
import { ApplyConfirmationCard } from './components/apply-confirmation-card';
import { BriefEditor } from './components/brief-editor';
import { Composer } from './components/composer';
import { ContinuitySnapshotCard } from './components/continuity-snapshot-card';
import { ProgressStateCard } from './components/progress-state-card';
import { ProposalCard } from './components/proposal-card';
import { SupportingContextPanel } from './components/supporting-context-panel';
import {
  isBroadOrganizerPrompt,
  parseChatErrorPayload,
  type EventAiWizardApplyNotice,
  type EventAiWizardAppliedState,
  type EventAiWizardPanelProps,
  type EventAiWizardScaffoldKey,
} from './shared';

export function EventAiWizardPanel({
  editionId,
  stepId,
  stepTitle,
  suggestions,
  markdownFocus = false,
  initialEventBrief = null,
  embeddedInWorkspace = false,
}: EventAiWizardPanelProps) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const tAssistantLoose = (key: string) => t(key as never);
  const locale = useLocale();
  const router = useRouter();
  const { setOpen: setAssistantOpen } = useAssistantWorkspaceQueryState();
  const composerId = useId();
  const composerHintId = useId();
  const briefEditorId = useId();
  const briefEditorHintId = useId();
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const briefStorageKey = `event-ai-wizard:brief:${editionId}`;
  const draftStorageKey = `event-ai-wizard:draft:${editionId}:${stepId}`;
  const continuityStorageKey = `event-ai-wizard:continuity:${editionId}`;
  const editorFocusStorageKey = `event-ai-wizard:editor-focus:${editionId}`;

  const [input, setInput] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.sessionStorage.getItem(draftStorageKey) ?? '';
  });
  const [appliedPatchIds, setAppliedPatchIds] = useState<Set<string>>(() => new Set());
  const [lastSentText, setLastSentText] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lastAppliedPatch, setLastAppliedPatch] = useState<EventAiWizardAppliedState | null>(null);
  const [lastApplyNotice, setLastApplyNotice] = useState<EventAiWizardApplyNotice | null>(null);

  const resolveBriefErrorMessage = (code?: string) => {
    switch (code) {
      case 'PRO_REQUIRED':
        return t('errors.proRequired');
      case 'FEATURE_DISABLED':
        return t('errors.disabled');
      case 'FORBIDDEN':
        return t('errors.readOnlyDescription');
      case 'VALIDATION_ERROR':
        return t('errors.invalid');
      default:
        return t('errors.failed');
    }
  };

  const brief = useEventAiWizardBrief({
    editionId,
    briefStorageKey,
    initialEventBrief,
    onPersistSuccess: () => router.refresh(),
    resolveBriefErrorMessage,
    toastError: (message) => toast.error(message),
  });

  const transport = useEventAiWizardTransport({
    editionId,
    stepId,
    locale,
    eventBrief: brief.eventBrief,
  });

  const proposalView = useEventAiWizardProposalView(transport.messages);

  const isBusy = transport.status === 'submitted' || transport.status === 'streaming';
  const parsedChatError = parseChatErrorPayload(transport.error);

  const continuity = useEventAiWizardContinuity({
    continuityStorageKey,
    stepId,
    latestRequestMessage: proposalView.latestRequestMessage,
    latestProposalMessage: proposalView.latestProposalMessage,
    latestProposalText: proposalView.latestProposalText,
    latestProposalPatch: proposalView.latestProposalPatchPart
      ? {
          title: proposalView.latestProposalPatchPart.data.title,
          summary: proposalView.latestProposalPatchPart.data.summary,
        }
      : null,
    isBusy,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(draftStorageKey, input);
  }, [draftStorageKey, input]);

  useEffect(() => {
    if (!transport.error) return;
    if (!proposalView.latestProposalMessage && !lastAppliedPatch) return;
    transport.clearError();
  }, [
    transport,
    transport.error,
    transport.clearError,
    lastAppliedPatch,
    proposalView.latestProposalMessage,
  ]);

  useEffect(() => {
    if (
      !transport.latencyMarks.requestStartedAt ||
      transport.latencyMarks.firstTextAt ||
      !proposalView.latestAssistantWithoutPatch
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      transport.setLatencyMarks((current) =>
        current.requestStartedAt && !current.firstTextAt
          ? { ...current, firstTextAt: Date.now() }
          : current,
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, [proposalView.latestAssistantWithoutPatch, transport]);

  useEffect(() => {
    if (
      !transport.latencyMarks.requestStartedAt ||
      transport.latencyMarks.proposalReadyAt ||
      !proposalView.latestProposalMessage
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      const timestamp = Date.now();
      transport.setLatencyMarks((current) =>
        current.requestStartedAt && !current.proposalReadyAt
          ? {
              ...current,
              firstTextAt:
                current.firstTextAt ?? (proposalView.latestProposalText ? timestamp : null),
              proposalReadyAt: timestamp,
            }
          : current,
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, [proposalView.latestProposalMessage, proposalView.latestProposalText, transport]);

  const activeElapsedMs = transport.latencyMarks.requestStartedAt
    ? (transport.latencyMarks.proposalReadyAt ?? nowMs) - transport.latencyMarks.requestStartedAt
    : null;

  const shouldShowSlowScaffold =
    !proposalView.latestProposalMessage &&
    !transport.fastPathStructure &&
    isBusy &&
    Boolean(lastSentText.trim()) &&
    activeElapsedMs !== null &&
    activeElapsedMs >= (isBroadOrganizerPrompt(lastSentText) ? 1200 : 3500);

  const slowScaffoldKey: EventAiWizardScaffoldKey | null = shouldShowSlowScaffold
    ? stepId === 'content'
      ? 'content'
      : stepId === 'policies'
        ? 'policies'
        : stepId === 'review'
          ? 'review'
          : stepId === 'basics'
            ? 'basics'
            : 'generic'
    : null;

  useEffect(() => {
    if (
      !isBusy ||
      !transport.latencyMarks.requestStartedAt ||
      transport.latencyMarks.proposalReadyAt
    )
      return;

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 500);

    return () => window.clearInterval(timer);
  }, [isBusy, transport.latencyMarks.proposalReadyAt, transport.latencyMarks.requestStartedAt]);

  const resolveProgressContent = (code: string | null) => {
    switch (code) {
      case 'grounding_snapshot':
        return {
          title: t('progress.grounding.title'),
          description: t('progress.grounding.description', { step: stepTitle }),
        };
      case 'drafting_response':
        return {
          title: t('progress.drafting.title'),
          description: t('progress.drafting.description', { step: stepTitle }),
        };
      case 'finalizing_proposal':
        return {
          title: t('progress.finalizing.title'),
          description: t('progress.finalizing.description'),
        };
      case 'analyzing_request':
      default:
        return {
          title: t('progress.analyzing.title'),
          description: t('progress.analyzing.description', { step: stepTitle }),
        };
    }
  };

  const resolveSlowFeedback = (elapsedMs: number | null) => {
    if (!elapsedMs || !isBusy) return null;
    if (elapsedMs >= 8000)
      return { title: t('latency.verySlow.title'), description: t('latency.verySlow.description') };
    if (elapsedMs >= 4000)
      return { title: t('latency.slow.title'), description: t('latency.slow.description') };
    return null;
  };

  const visibleProgressState =
    proposalView.latestProposalMessage || (!isBusy && !transport.error)
      ? null
      : transport.progressState;
  const slowFeedback = resolveSlowFeedback(activeElapsedMs);
  const visibleProgressContent = resolveProgressContent(
    visibleProgressState?.code ?? 'analyzing_request',
  );
  const activeProgressLabel = slowFeedback?.title ?? visibleProgressContent.title;
  const activeProgressDescription = slowFeedback?.description ?? visibleProgressContent.description;
  const activeProgressEmphasis = slowFeedback ? 'slow' : 'normal';
  const shouldShowAnimatedProgress =
    !!visibleProgressState && !proposalView.latestAssistantWithoutPatch;

  const resolveChatErrorMessage = () => {
    switch (parsedChatError?.code) {
      case 'PRO_REQUIRED':
        return t('errors.proRequired');
      case 'FEATURE_DISABLED':
        return t('errors.disabled');
      case 'READ_ONLY':
        return t('errors.readOnlyDescription');
      case 'RATE_LIMITED':
        return t('errors.rateLimited');
      case 'SAFETY_BLOCKED':
        return parsedChatError.category === 'prompt_injection'
          ? t('errors.safety.promptInjection')
          : t('errors.safety.policyViolation');
      default:
        return t('errors.requestFailedHint');
    }
  };

  const handleSend = async (nextText?: string) => {
    const text = (nextText ?? input).trim();
    if (!text || isBusy) return;
    if (transport.status === 'error') {
      transport.clearError();
    }
    const requestStartedAt = Date.now();
    transport.setLatencyMarks({
      requestStartedAt,
      firstProgressAt: null,
      firstStructureAt: null,
      firstTextAt: null,
      proposalReadyAt: null,
    });
    setNowMs(requestStartedAt);
    transport.setProgressState({ code: 'analyzing_request', level: 'info' });
    transport.setFastPathStructure(null);
    transport.setEarlyProseLead(null);
    setLastSentText(text);
    setLastAppliedPatch(null);
    setLastApplyNotice(null);
    transport.sendMessage({ text });
    setInput('');
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(draftStorageKey);
    }
  };

  const handleNavigateToStep = (nextStepId: typeof stepId) => {
    const url = new URL(window.location.href);
    url.searchParams.set('wizard', '1');
    url.searchParams.set('step', nextStepId);
    router.push(`${url.pathname}${url.search}` as never);
  };

  const handleRevealEditor = (target?: 'location') => {
    if (typeof window !== 'undefined' && target) {
      window.sessionStorage.setItem(editorFocusStorageKey, target);
    }
    setAssistantOpen(false);
  };

  const handleReuseRequest = (requestText: string) => {
    setInput(requestText);
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(requestText.length, requestText.length);
    });
  };

  const handleRequestManualLocationClarification = (query: string) => {
    const prompt = t('locationResolution.choice.manualClarificationPrompt', { query });
    setInput(prompt);
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(prompt.length, prompt.length);
    });
  };

  return (
    <section
      className={cn(
        'overflow-hidden rounded-3xl border border-border/60 bg-background shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/8 dark:bg-[#0d1017]/96 dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]',
        embeddedInWorkspace && 'border-none bg-transparent shadow-none',
      )}
      data-latency-request-started-at={transport.latencyMarks.requestStartedAt ?? undefined}
      data-latency-first-progress-ms={
        transport.latencyMarks.requestStartedAt && transport.latencyMarks.firstProgressAt
          ? transport.latencyMarks.firstProgressAt - transport.latencyMarks.requestStartedAt
          : undefined
      }
      data-latency-first-structure-ms={
        transport.latencyMarks.requestStartedAt && transport.latencyMarks.firstStructureAt
          ? transport.latencyMarks.firstStructureAt - transport.latencyMarks.requestStartedAt
          : undefined
      }
      data-latency-first-text-ms={
        transport.latencyMarks.requestStartedAt && transport.latencyMarks.firstTextAt
          ? transport.latencyMarks.firstTextAt - transport.latencyMarks.requestStartedAt
          : undefined
      }
      data-latency-proposal-ready-ms={
        transport.latencyMarks.requestStartedAt && transport.latencyMarks.proposalReadyAt
          ? transport.latencyMarks.proposalReadyAt - transport.latencyMarks.requestStartedAt
          : undefined
      }
    >
      {embeddedInWorkspace ? (
        <div className="px-1 pb-1 pt-2 sm:px-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              {t('inline.title', { step: stepTitle })}
            </p>
            {markdownFocus ? (
              <span className="rounded-full border border-border/60 bg-muted/15 px-2 py-0.5 text-[11px] font-medium text-foreground">
                {t('inline.markdownBadge')}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t('inline.description')}</p>
        </div>
      ) : (
        <header className="border-b border-border/60 px-4 py-4 sm:px-5 sm:py-5 dark:border-white/8">
          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {t('inline.title', { step: stepTitle })}
                </h2>
                {markdownFocus ? (
                  <span className="rounded-full border border-border/60 bg-muted/15 px-2 py-0.5 text-[11px] font-medium text-foreground">
                    {t('inline.markdownBadge')}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t('inline.description')}</p>
            </div>
          </div>
        </header>
      )}

      <div className="space-y-5 px-4 py-4 sm:px-5">
        <section className="rounded-2xl border border-border/60 bg-muted/10 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {tAssistantLoose('trust.title')}
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground">{t('contract')}</p>
          <dl className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
            <div className="space-y-1">
              <dt className="font-medium text-foreground">{tAssistantLoose('trust.applyLabel')}</dt>
              <dd>{tAssistantLoose('trust.applyDescription')}</dd>
            </div>
            <div className="space-y-1">
              <dt className="font-medium text-foreground">{tAssistantLoose('trust.saveLabel')}</dt>
              <dd>{tAssistantLoose('trust.saveDescription')}</dd>
            </div>
            <div className="space-y-1">
              <dt className="font-medium text-foreground">
                {tAssistantLoose('trust.recoveryLabel')}
              </dt>
              <dd>{tAssistantLoose('trust.recoveryDescription')}</dd>
            </div>
          </dl>
        </section>

        {lastApplyNotice ? (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-4"
          >
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {lastApplyNotice.kind === 'partial'
                    ? tAssistantLoose('recovery.partialTitle')
                    : tAssistantLoose('recovery.title')}
                </p>
                <p className="mt-1 text-sm text-destructive/90">{lastApplyNotice.message}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {lastApplyNotice.kind === 'partial'
                    ? tAssistantLoose('recovery.partialDescription')
                    : tAssistantLoose('recovery.description')}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {continuity.recoveredContinuitySnapshot ? (
          <ContinuitySnapshotCard
            snapshot={continuity.recoveredContinuitySnapshot}
            onReuseRequest={handleReuseRequest}
          />
        ) : null}

        {lastAppliedPatch ? (
          <ApplyConfirmationCard
            appliedState={lastAppliedPatch}
            onRevealEditor={handleRevealEditor}
            onNavigateToStep={handleNavigateToStep}
          />
        ) : null}

        {proposalView.latestProposalMessage && proposalView.latestProposalPatchPart ? (
          <section className="rounded-2xl border border-border/60 bg-background p-4 dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none">
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-muted/10 px-4 py-3 dark:border-primary/20 dark:bg-primary/[0.08]">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('latestProposal.title')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('latestProposal.description')}
                </p>
              </div>

              <ProposalCard
                editionId={editionId}
                patchId={
                  proposalView.latestProposalPatchPart.id ??
                  `${proposalView.latestProposalMessage.id}-patch`
                }
                patch={proposalView.latestProposalPatchPart.data}
                locale={locale}
                activeStepId={stepId}
                applied={appliedPatchIds.has(
                  proposalView.latestProposalPatchPart.id ??
                    `${proposalView.latestProposalMessage.id}-patch`,
                )}
                onApplyStart={() => setLastApplyNotice(null)}
                onApplied={(appliedState) => {
                  const patchId =
                    proposalView.latestProposalPatchPart?.id ??
                    `${proposalView.latestProposalMessage?.id}-patch`;
                  setAppliedPatchIds((prev) => new Set([...prev, patchId]));
                  setLastApplyNotice(null);
                  setLastAppliedPatch(appliedState);
                }}
                onApplyFailure={(message) => {
                  setLastApplyNotice({
                    kind: message === t('errors.partialApplied') ? 'partial' : 'failed',
                    message,
                  });
                }}
                onRevealEditor={handleRevealEditor}
                onNavigateToStep={handleNavigateToStep}
                onRequestManualClarification={handleRequestManualLocationClarification}
                router={router}
              />

              <SupportingContextPanel
                latestRequestMessage={proposalView.latestRequestMessage}
                latestProposalMessage={proposalView.latestProposalMessage}
                latestProposalText={proposalView.latestProposalText}
                archiveMessages={proposalView.archiveMessages}
              />
            </div>
          </section>
        ) : proposalView.renderedMessages.length > 0 || isBusy || visibleProgressState ? (
          <ProgressStateCard
            latestVisibleUserMessage={proposalView.latestVisibleUserMessage}
            latestAssistantWithoutPatch={proposalView.latestAssistantWithoutPatch}
            visibleProgressLabel={activeProgressLabel}
            visibleProgressDescription={activeProgressDescription}
            progressEmphasis={activeProgressEmphasis}
            showAnimatedProgress={shouldShowAnimatedProgress}
            earlyProseLead={transport.earlyProseLead}
            fastPathStructure={transport.fastPathStructure}
            slowScaffoldKey={slowScaffoldKey}
          />
        ) : (
          <section className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.025]">
            <p className="font-medium text-foreground">{t('empty.heading')}</p>
            <p className="mt-1 leading-6">{t('empty.example')}</p>
          </section>
        )}

        <Composer
          composerId={composerId}
          composerHintId={composerHintId}
          input={input}
          isBusy={isBusy}
          suggestions={suggestions}
          hasSavedBrief={brief.hasSavedBrief}
          composerRef={composerRef}
          onInputChange={setInput}
          onSuggestionSelect={setInput}
          onSend={() => void handleSend()}
          onStop={() => transport.stop()}
        />

        <BriefEditor
          briefEditorId={briefEditorId}
          briefEditorHintId={briefEditorHintId}
          eventBrief={brief.eventBrief}
          briefDraft={brief.briefDraft}
          hasSavedBrief={brief.hasSavedBrief}
          hasBriefDraftChanges={brief.hasBriefDraftChanges}
          isEditingBrief={brief.isEditingBrief}
          isPersistingBrief={brief.isPersistingBrief}
          onBriefDraftChange={brief.setBriefDraft}
          onStartEditing={brief.startEditing}
          onCancelEditing={brief.cancelEditing}
          onSave={() => void brief.saveBrief()}
          onClear={() => void brief.persistEventBrief('')}
          onUseForStep={() => void handleSend(t('brief.useForStepPrompt', { step: stepTitle }))}
        />

        {transport.error ? (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <p className="font-medium">{t('errors.title')}</p>
            <p className="mt-1 text-xs text-destructive/80">{resolveChatErrorMessage()}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export type { EventAiAssistantStepId } from './shared';
