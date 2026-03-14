'use client';

import { DefaultChatTransport } from 'ai';
import type { UIMessagePart } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, MapPin, Send, Sparkles, Square } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { useRouter } from '@/i18n/navigation';
import { updateEventEdition } from '@/lib/events/actions';
import type {
  EventAiWizardChoiceRequest,
  EventAiWizardOp,
  EventAiWizardPatch,
  EventAiWizardCrossStepIntent,
  EventAiWizardMarkdownOutput,
  EventAiWizardIntentRoute,
  EventAiWizardMissingFieldItem,
} from '@/lib/events/ai-wizard/schemas';
import type {
  EventAiWizardDataTypes,
  EventAiWizardEarlyProseLead,
  EventAiWizardFastPathStructure,
  EventAiWizardNotificationCode,
  EventAiWizardUIMessage,
} from '@/lib/events/ai-wizard/ui-types';
import { cn } from '@/lib/utils';

import { useAssistantWorkspaceQueryState } from './event-assistant-workspace-state';

export type EventAiAssistantStepId =
  | 'basics'
  | 'distances'
  | 'pricing'
  | 'registration'
  | 'policies'
  | 'content'
  | 'extras'
  | 'review';

type EventAiWizardPanelProps = {
  editionId: string;
  stepId: EventAiAssistantStepId;
  stepTitle: string;
  suggestions: string[];
  markdownFocus?: boolean;
  initialEventBrief?: string | null;
  embeddedInWorkspace?: boolean;
};

type UnknownUITools = Record<string, { input: unknown; output: unknown | undefined }>;

type EventAiWizardChatErrorPayload = {
  code?: string;
  category?: string;
};

type EventAiWizardProgressState = {
  code: EventAiWizardNotificationCode;
  level: 'info' | 'success' | 'error';
};

type EventAiWizardLatencyMarks = {
  requestStartedAt: number | null;
  firstProgressAt: number | null;
  firstStructureAt: number | null;
  firstTextAt: number | null;
  proposalReadyAt: number | null;
};

type EventAiWizardScaffoldKey =
  | 'basics'
  | 'content'
  | 'policies'
  | 'review'
  | 'generic';

type EventAiWizardContinuitySnapshot = {
  sourceStepId: EventAiAssistantStepId;
  latestRequestMessage: Pick<EventAiWizardUIMessage, 'id' | 'role' | 'parts'> | null;
  latestProposalMessage: Pick<EventAiWizardUIMessage, 'id' | 'role' | 'parts'> | null;
  latestProposalText: string;
  latestProposalPatch: Pick<EventAiWizardPatch, 'title' | 'summary'> | null;
};

type EventAiWizardAppliedState = {
  patchId: string;
  title: string;
  summary: string;
  action?:
    | {
        kind: 'editor';
        target?: EventAiWizardEditorFocusTarget;
      }
    | {
        kind: 'step';
        stepId: EventAiAssistantStepId;
      };
};

type EventAiWizardEditorFocusTarget = 'location';

type EventAiWizardResolvedLocationCandidate = Extract<
  NonNullable<EventAiWizardPatch['locationResolution']>,
  { status: 'matched' }
>['candidate'];

function isEventPatchPart(
  part: UIMessagePart<EventAiWizardDataTypes, UnknownUITools>,
): part is { type: 'data-event-patch'; id?: string; data: EventAiWizardPatch } {
  return part.type === 'data-event-patch';
}

function resolvePriceCents(data: { priceCents?: number; price?: number }): number {
  if (data.priceCents !== undefined) return data.priceCents;
  return Math.round((data.price ?? 0) * 100);
}

function formatCurrency(locale: string, valueCents: number, currency = 'MXN'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(valueCents / 100);
}

function parseChatErrorPayload(error: Error | undefined): EventAiWizardChatErrorPayload | null {
  if (!error?.message) return null;

  try {
    const parsed = JSON.parse(error.message) as EventAiWizardChatErrorPayload;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeOrganizerPrompt(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function isBroadOrganizerPrompt(text: string) {
  const normalized = normalizeOrganizerPrompt(text);
  if (!normalized) return false;

  return (
    normalized.length <= 80 ||
    normalized.includes('ayudame con esto') ||
    normalized.includes('mejora esto') ||
    normalized.includes('organiza estas notas') ||
    normalized.includes('help me with this') ||
    normalized.includes('improve this') ||
    normalized.includes('organize these notes')
  );
}

function MarkdownOutputsList({ outputs }: { outputs: EventAiWizardMarkdownOutput[] }) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');

  if (!outputs.length) return null;

  const participantFacingDomains = new Set(['description', 'faq', 'waiver', 'website', 'policy', 'summary']);

  return (
    <div className="mt-3 space-y-2 rounded-2xl border border-border/70 bg-background/80 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('outputs.title')}
      </p>
      <ul className="space-y-2">
        {outputs.map((output, index) => (
          <li key={`${output.domain}-${index}`} className="rounded-xl border border-border/60 bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium text-foreground">
                {output.title ?? t(`outputs.domain.${output.domain}`)}
              </p>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium',
                  participantFacingDomains.has(output.domain)
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {participantFacingDomains.has(output.domain)
                  ? t('outputs.participantBadge')
                  : t('outputs.structuredBadge')}
              </span>
            </div>
            <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('outputs.previewLabel')}
            </p>
            <div className="mt-2 rounded-2xl border border-border/60 bg-background/90 p-4">
              <MarkdownContent
                content={output.contentMarkdown}
                className="text-sm [&_h1]:mt-0 [&_h2]:mt-0 [&_h3]:mt-0 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LocationResolutionCard({
  resolution,
}: {
  resolution: NonNullable<EventAiWizardPatch['locationResolution']>;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');

  if (resolution.status === 'matched') {
    return (
      <div className="mt-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <MapPin className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              {t('locationResolution.matched.eyebrow')}
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {t('locationResolution.matched.title')}
            </p>
            <p className="mt-2 text-sm leading-6 text-foreground">
              {resolution.candidate.formattedAddress}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('locationResolution.matched.description')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (resolution.status === 'ambiguous') {
    return (
      <div className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
          {t('locationResolution.ambiguous.eyebrow')}
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground">
          {t('locationResolution.ambiguous.title')}
        </p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {t('locationResolution.ambiguous.description')}
        </p>
        <ul className="mt-3 space-y-2 text-sm text-foreground">
          {resolution.candidates.map((candidate, index) => (
            <li key={`${candidate.placeId ?? candidate.formattedAddress}-${index}`} className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
              {candidate.formattedAddress}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-border/60 bg-background/55 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('locationResolution.noMatch.eyebrow')}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {t('locationResolution.noMatch.title')}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {t('locationResolution.noMatch.description')}
      </p>
    </div>
  );
}

function buildPatchWithSelectedLocation(
  patch: EventAiWizardPatch,
  candidate: EventAiWizardResolvedLocationCandidate,
): EventAiWizardPatch {
  const editionScopedOp = patch.ops.find(
    (
      op,
    ): op is Extract<
      EventAiWizardOp,
      | { type: 'update_edition' }
      | { type: 'create_distance' }
      | { type: 'create_faq_item' }
      | { type: 'create_waiver' }
      | { type: 'create_question' }
      | { type: 'create_add_on' }
      | { type: 'append_website_section_markdown' }
      | { type: 'append_policy_markdown' }
    > => 'editionId' in op,
  );

  if (!editionScopedOp) {
    return patch;
  }

  const locationOp: Extract<EventAiWizardOp, { type: 'update_edition' }> = {
    type: 'update_edition',
    editionId:
      patch.ops.find(
        (op): op is Extract<EventAiWizardOp, { type: 'update_edition' }> =>
          op.type === 'update_edition',
      )?.editionId ?? editionScopedOp.editionId,
    data: {
      locationDisplay: candidate.formattedAddress,
      address: candidate.formattedAddress,
      city: candidate.city ?? null,
      state: candidate.region ?? null,
      latitude: String(candidate.lat),
      longitude: String(candidate.lng),
    },
  };

  const ops = [...patch.ops];
  const updateEditionIndex = ops.findIndex((op) => op.type === 'update_edition');

  if (updateEditionIndex >= 0) {
    const updateEdition = ops[updateEditionIndex] as Extract<EventAiWizardOp, { type: 'update_edition' }>;
    ops[updateEditionIndex] = {
      ...updateEdition,
      data: {
        ...updateEdition.data,
        ...locationOp.data,
      },
    };
  } else {
    ops.unshift(locationOp);
  }

  return {
    ...patch,
    ops,
    locationResolution: {
      status: 'matched',
      query: patch.locationResolution?.query ?? candidate.formattedAddress,
      candidate,
    },
    choiceRequest: undefined,
  };
}

function LocationChoiceRequestCard({
  request,
  selectedCandidate,
  onSelectCandidate,
  onRevealEditor,
  onRequestManualClarification,
}: {
  request: EventAiWizardChoiceRequest;
  selectedCandidate: EventAiWizardResolvedLocationCandidate | null;
  onSelectCandidate: (candidate: EventAiWizardResolvedLocationCandidate) => void;
  onRevealEditor: (target?: EventAiWizardEditorFocusTarget) => void;
  onRequestManualClarification: (query: string) => void;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');

  return (
    <div className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
        {t('locationResolution.ambiguous.eyebrow')}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {t('locationResolution.choice.title')}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {t('locationResolution.choice.description')}
      </p>
      <ul className="mt-3 space-y-2">
        {request.options.map((candidate, index) => {
          const isSelected = selectedCandidate?.placeId === candidate.placeId;
          return (
            <li
              key={`${candidate.placeId ?? candidate.formattedAddress}-${index}`}
              className={cn(
                'rounded-xl border px-3 py-3',
                isSelected
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-border/50 bg-background/70',
              )}
            >
              <p className="text-sm font-medium text-foreground">{candidate.formattedAddress}</p>
              {candidate.city || candidate.region ? (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {[candidate.city, candidate.region].filter(Boolean).join(', ')}
                </p>
              ) : null}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  variant={isSelected ? 'default' : 'secondary'}
                  onClick={() => onSelectCandidate(candidate)}
                >
                  {isSelected
                    ? t('locationResolution.choice.selected')
                    : t('locationResolution.choice.useThis')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" size="sm" variant="secondary" onClick={() => onRequestManualClarification(request.query)}>
          {t('locationResolution.choice.noneOfThese')}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => onRevealEditor('location')}>
          {t('locationResolution.choice.searchInEditor')}
        </Button>
      </div>
    </div>
  );
}

function getMessageText(message: EventAiWizardUIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { text: string }).text.trim())
    .filter(Boolean)
    .join('\n\n');
}

function MessageBubble({
  message,
}: {
  message: Pick<EventAiWizardUIMessage, 'id' | 'role' | 'parts'>;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const text = getMessageText(message as EventAiWizardUIMessage);

  if (!text) return null;

  const roleLabel = message.role === 'user' ? t('messages.user') : t('messages.assistant');

  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-sm',
        message.role === 'user'
          ? 'border-primary/20 bg-primary text-primary-foreground'
          : 'border-border/70 bg-card text-foreground',
      )}
    >
      <p className="sr-only">{roleLabel}</p>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function RequestSummaryCard({
  message,
}: {
  message: Pick<EventAiWizardUIMessage, 'id' | 'role' | 'parts'>;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const text = getMessageText(message as EventAiWizardUIMessage);

  if (!text) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-background/50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('pending.requestLabel')}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{text}</p>
    </div>
  );
}

function ConversationExcerpt({
  label,
  text,
  tone = 'default',
  renderMarkdown = false,
}: {
  label: string;
  text: string;
  tone?: 'default' | 'assistant';
  renderMarkdown?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-3',
        tone === 'assistant'
          ? 'border-border/60 bg-background/55 dark:border-white/10 dark:bg-white/[0.03]'
          : 'border-border/50 bg-background/45 dark:border-white/8 dark:bg-white/[0.02]',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {renderMarkdown ? (
        <MarkdownContent
          content={text}
          className="mt-2 text-sm leading-6 text-foreground prose-p:my-0 prose-headings:my-0 prose-ul:my-2 prose-li:my-1"
        />
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{text}</p>
      )}
    </div>
  );
}

function SupportingContextPanel({
  latestRequestMessage,
  latestProposalMessage,
  latestProposalText,
  archiveMessages,
}: {
  latestRequestMessage: EventAiWizardUIMessage | null;
  latestProposalMessage: EventAiWizardUIMessage | null;
  latestProposalText: string;
  archiveMessages: EventAiWizardUIMessage[];
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');

  if (!latestRequestMessage && !latestProposalText && !archiveMessages.length) return null;

  return (
    <details className="group rounded-2xl border border-border/60 bg-background/50 p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{t('latestProposal.supportingContextTitle')}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('latestProposal.supportingContextDescription', {
                count: archiveMessages.length,
              })}
            </p>
          </div>
          <span className="text-xs font-medium text-muted-foreground group-open:hidden">
            {t('archive.expand')}
          </span>
          <span className="hidden text-xs font-medium text-muted-foreground group-open:inline">
            {t('archive.collapse')}
          </span>
        </div>
      </summary>

      <div className="mt-4 space-y-4 border-t border-border/60 pt-4">
        {latestRequestMessage ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('latestProposal.requestLabel')}
            </p>
            <MessageBubble message={latestRequestMessage} />
          </div>
        ) : null}

        {latestProposalText && latestProposalMessage ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('latestProposal.responseLabel')}
            </p>
            <ConversationExcerpt
              label={t('latestProposal.responseLabel')}
              text={latestProposalText}
              tone="assistant"
              renderMarkdown
            />
          </div>
        ) : null}

        {archiveMessages.length ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('archive.title')}
            </p>
            <div className="space-y-3">
              {archiveMessages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function FastPathStructureCard({
  structure,
}: {
  structure: EventAiWizardFastPathStructure;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const sectionBaseKey = `fastPath.${structure.kind}.sections` as const;

  return (
    <div className="rounded-2xl border border-primary/15 bg-background/60 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        {t('fastPath.eyebrow')}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {t(`fastPath.${structure.kind}.title` as never)}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {t(`fastPath.${structure.kind}.description` as never)}
      </p>
      <ul className="mt-3 space-y-2 text-sm text-foreground">
        {structure.sectionKeys.map((sectionKey) => (
          <li key={sectionKey} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/70" />
            <span>{t(`${sectionBaseKey}.${sectionKey}` as never)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SlowProposalScaffoldCard({
  scaffoldKey,
}: {
  scaffoldKey: EventAiWizardScaffoldKey;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const sectionBaseKey = `scaffold.${scaffoldKey}.sections` as const;
  const sectionKeys = ['first_pass', 'confirmed_facts', 'open_points'] as const;

  return (
    <div className="rounded-2xl border border-border/60 bg-background/55 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('scaffold.eyebrow')}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {t(`scaffold.${scaffoldKey}.title` as never)}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {t(`scaffold.${scaffoldKey}.description` as never)}
      </p>
      <ul className="mt-3 space-y-2 text-sm text-foreground">
        {sectionKeys.map((sectionKey) => (
          <li key={sectionKey} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/70" />
            <span>{t(`${sectionBaseKey}.${sectionKey}` as never)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EarlyProseLeadCard({ lead }: { lead: EventAiWizardEarlyProseLead }) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');

  return (
    <div className="rounded-2xl border border-primary/15 bg-background/60 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        {t('earlyProse.eyebrow')}
      </p>
      <p className="mt-2 text-sm leading-6 text-foreground">{lead.body}</p>
    </div>
  );
}

function AnimatedProgressLabel({
  label,
  description,
  emphasis,
}: {
  label: string;
  description: string;
  emphasis?: 'normal' | 'slow';
}) {
  const isSlow = emphasis === 'slow';

  return (
    <div className="px-1 py-1">
      <div className="flex items-center gap-2">
        <span className="assistant-working-dot mt-0.5 size-2.5 shrink-0 rounded-full bg-primary/35" />
        <p
          className={cn(
            'assistant-working-label text-sm font-semibold italic',
            isSlow && 'opacity-95',
          )}
        >
          {label}
        </p>
      </div>
      <p
        className={cn(
          'mt-1.5 text-sm leading-6 italic text-muted-foreground/90',
          isSlow && 'text-muted-foreground',
        )}
      >
        {description}
      </p>
    </div>
  );
}

function ContinuitySnapshotCard({
  snapshot,
  onReuseRequest,
}: {
  snapshot: EventAiWizardContinuitySnapshot;
  onReuseRequest: (requestText: string) => void;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const tPage = useTranslations('pages.dashboardEventSettings');
  const latestRequestText = snapshot.latestRequestMessage
    ? getMessageText(snapshot.latestRequestMessage as EventAiWizardUIMessage)
    : '';

  return (
    <div className="rounded-2xl border border-border/60 bg-background/55 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('continuity.eyebrow')}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {t('continuity.title', {
          step: tPage(`wizardShell.steps.${snapshot.sourceStepId}` as never),
        })}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('continuity.description')}</p>
      <div className="mt-3 space-y-3">
        {snapshot.latestRequestMessage && latestRequestText ? (
          <ConversationExcerpt
            label={t('latestProposal.requestLabel')}
            text={latestRequestText}
          />
        ) : null}
        {snapshot.latestProposalPatch ? (
          <ConversationExcerpt
            label={t('continuity.proposalLabel')}
            text={`${snapshot.latestProposalPatch.title}\n${snapshot.latestProposalPatch.summary}`}
            tone="assistant"
            renderMarkdown
          />
        ) : snapshot.latestProposalText && snapshot.latestProposalMessage ? (
          <ConversationExcerpt
            label={t('latestProposal.responseLabel')}
            text={snapshot.latestProposalText}
            tone="assistant"
            renderMarkdown
          />
        ) : null}
      </div>
      {latestRequestText ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onReuseRequest(latestRequestText)}
          >
            {t('continuity.reuseRequest')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AppliedConfirmationCard({
  appliedState,
  onRevealEditor,
  onNavigateToStep,
}: {
  appliedState: EventAiWizardAppliedState;
  onRevealEditor: (target?: EventAiWizardEditorFocusTarget) => void;
  onNavigateToStep: (stepId: EventAiAssistantStepId) => void;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const tPage = useTranslations('pages.dashboardEventSettings');

  const stepActionLabel =
    appliedState.action?.kind === 'step'
      ? t('appliedState.goToStep', {
          step: tPage(`wizardShell.steps.${appliedState.action.stepId}` as never),
        })
      : null;

  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
        {t('appliedState.eyebrow')}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{appliedState.title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{appliedState.summary}</p>
      {appliedState.action ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {appliedState.action.kind === 'editor' ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onRevealEditor(appliedState.action?.kind === 'editor' ? appliedState.action.target : undefined)}
            >
              {t('appliedState.revealEditor')}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                onNavigateToStep(
                  appliedState.action?.kind === 'step' ? appliedState.action.stepId : 'basics',
                )
              }
            >
              {stepActionLabel}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function getAppliedStepTarget(patch: EventAiWizardPatch): EventAiAssistantStepId | null {
  for (const op of patch.ops) {
    switch (op.type) {
      case 'create_distance':
        return 'distances';
      case 'update_distance_price':
      case 'create_pricing_tier':
        return 'pricing';
      case 'create_faq_item':
      case 'append_website_section_markdown':
        return 'content';
      case 'create_waiver':
      case 'append_policy_markdown':
        return 'policies';
      case 'create_question':
      case 'create_add_on':
        return 'extras';
      default:
        break;
    }
  }

  return null;
}

function buildAppliedState({
  patchId,
  patch,
  activeStepId,
}: {
  patchId: string;
  patch: EventAiWizardPatch;
  activeStepId: EventAiAssistantStepId;
}): EventAiWizardAppliedState {
  const crossStepTarget = getAppliedStepTarget(patch);

  if (activeStepId === 'basics') {
    const basicsUpdate = patch.ops.find((op) => op.type === 'update_edition');
    if (basicsUpdate?.type === 'update_edition') {
      const savedLocation =
        Boolean(
          basicsUpdate.data.locationDisplay &&
            String(basicsUpdate.data.latitude ?? '').trim() &&
            String(basicsUpdate.data.longitude ?? '').trim(),
        );

      if (savedLocation) {
        return {
          patchId,
          title: patch.title,
          summary: patch.summary,
          action: {
            kind: 'editor',
            target: 'location',
          },
        };
      }

      return {
        patchId,
        title: patch.title,
        summary: patch.summary,
        action: {
          kind: 'editor',
        },
      };
    }
  }

  if (crossStepTarget && crossStepTarget !== activeStepId) {
    return {
      patchId,
      title: patch.title,
      summary: patch.summary,
      action: {
        kind: 'step',
        stepId: crossStepTarget,
      },
    };
  }

  return {
    patchId,
    title: patch.title,
    summary: patch.summary,
    action: {
      kind: 'editor',
    },
  };
}

function CrossStepHandoffCard({
  handoff,
  onNavigateToStep,
}: {
  handoff: EventAiWizardCrossStepIntent;
  onNavigateToStep: (stepId: EventAiAssistantStepId) => void;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const tPage = useTranslations('pages.dashboardEventSettings');

  function resolveStepLabel(stepId: EventAiAssistantStepId) {
    return tPage(`wizardShell.steps.${stepId}` as never);
  }

  function resolveIntentReason(intentType: EventAiWizardCrossStepIntent['intentType']) {
    return t(`handoff.reason.${intentType}` as never);
  }

  const primaryStepLabel = resolveStepLabel(handoff.primaryTargetStepId);
  const sourceStepLabel = resolveStepLabel(handoff.sourceStepId);
  const additionalStepLabels = (handoff.secondaryTargetStepIds ?? []).map((stepId) =>
    resolveStepLabel(stepId),
  );

  return (
    <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/[0.05] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        {t('handoff.eyebrow')}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {handoff.scope === 'mixed'
          ? t('handoff.titleMixed', { step: primaryStepLabel })
          : t('handoff.titleCrossStep', { step: primaryStepLabel })}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {handoff.scope === 'mixed'
          ? t('handoff.descriptionMixed', {
              currentStep: sourceStepLabel,
              step: primaryStepLabel,
            })
          : t('handoff.descriptionCrossStep', { step: primaryStepLabel })}
      </p>
      <p className="mt-2 text-sm leading-6 text-foreground">
        {resolveIntentReason(handoff.intentType)}
      </p>
      {additionalStepLabels.length ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t('handoff.secondaryTargets', {
            steps: additionalStepLabels.join(', '),
          })}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          size="sm"
          onClick={() => onNavigateToStep(handoff.primaryTargetStepId)}
        >
          {t('handoff.primaryAction', { step: primaryStepLabel })}
        </Button>
        {handoff.scope === 'mixed' ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onNavigateToStep(handoff.sourceStepId)}
          >
            {t('handoff.stayHereAction', { step: sourceStepLabel })}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function RoutingCard({
  checklist,
  intentRouting,
  onNavigateToStep,
}: {
  checklist: EventAiWizardMissingFieldItem[];
  intentRouting: EventAiWizardIntentRoute[];
  onNavigateToStep: (stepId: EventAiAssistantStepId) => void;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const tPage = useTranslations('pages.dashboardEventSettings');

  if (!checklist.length && !intentRouting.length) return null;

  function normalizeTranslationKey(key: string) {
    const withoutPagePrefix = key.startsWith('pages.dashboardEventSettings.')
      ? key.replace('pages.dashboardEventSettings.', '')
      : key;

    if (withoutPagePrefix.startsWith('wizard.steps.')) {
      return withoutPagePrefix.replace('wizard.steps.', 'wizardShell.steps.');
    }

    return withoutPagePrefix;
  }

  function resolveChecklistLabel(label: string) {
    const normalizedKey = normalizeTranslationKey(label);
    if (normalizedKey.startsWith('wizard.') || normalizedKey.startsWith('wizardShell.')) {
      return tPage(normalizedKey as never);
    }

    return label;
  }

  function resolveStepLabel(stepId: EventAiAssistantStepId) {
    return tPage(`wizardShell.steps.${stepId}` as never);
  }

  function resolveStepAction(stepId: EventAiAssistantStepId) {
    return t(`routing.stepActions.${stepId}` as never);
  }

  function resolveIntentLabel(intent: string, stepId: EventAiAssistantStepId) {
    const knownLabels: Record<string, string> = {
      draft_website_overview: t('routing.intentLabels.draft_website_overview'),
    };

    return knownLabels[intent] ?? resolveStepAction(stepId);
  }

  const routingIntentPriority: Record<string, number> = {
    draft_website_overview: 90,
    create_faq: 80,
    draft_faq: 80,
    write_policy: 70,
    draft_policy: 70,
    review_publish_readiness: 60,
    fix_publish_blocker: 60,
    complete_basics: 50,
    configure_distances: 45,
    configure_pricing: 40,
  };

  const stepOrder: Record<EventAiAssistantStepId, number> = {
    basics: 0,
    distances: 1,
    pricing: 2,
    registration: 3,
    policies: 4,
    content: 5,
    extras: 6,
    review: 7,
  };

  const dedupedIntentRouting = intentRouting.reduce<
    Array<EventAiWizardIntentRoute & { label: string; priority: number }>
  >((acc, item) => {
    const label = resolveIntentLabel(item.intent, item.stepId);
    const priority = routingIntentPriority[item.intent] ?? 0;
    const existingIndex = acc.findIndex((entry) => entry.stepId === item.stepId);

    if (existingIndex === -1) {
      acc.push({ ...item, label, priority });
      return acc;
    }

    if (priority > (acc[existingIndex]?.priority ?? 0)) {
      acc[existingIndex] = { ...item, label, priority };
    }

    return acc;
  }, []).sort((left, right) => stepOrder[left.stepId] - stepOrder[right.stepId]);

  const checklistStepIds = new Set(checklist.map((item) => item.stepId));
  const visibleIntentRouting = dedupedIntentRouting.filter((item) => !checklistStepIds.has(item.stepId));

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-border/60 bg-background/55 p-3">
      {checklist.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('routing.checklistTitle')}
          </p>
          <div className="space-y-2">
            {checklist.map((item, index) => (
              <button
                key={`${item.code}-${item.stepId}-${index}`}
                type="button"
                className={cn(
                  'w-full rounded-2xl border px-4 py-3 text-left text-sm leading-6 transition',
                  item.severity === 'blocker'
                    ? 'border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10'
                    : item.severity === 'required'
                      ? 'border-amber-300/70 bg-amber-50 text-amber-900 hover:bg-amber-100'
                      : 'border-primary/30 bg-background text-foreground hover:bg-primary/10',
                )}
                onClick={() => onNavigateToStep(item.stepId)}
              >
                {resolveChecklistLabel(item.label)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {visibleIntentRouting.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('routing.intentTitle')}
          </p>
          <ul className="space-y-2">
            {visibleIntentRouting.map((item, index) => (
              <li
                key={`${item.intent}-${item.stepId}-${index}`}
                className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm"
              >
                <p className="font-medium text-foreground">{item.label}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-3 h-9 px-3 text-sm"
                  onClick={() => onNavigateToStep(item.stepId)}
                >
                  {t('routing.goToStep', { step: resolveStepLabel(item.stepId) })}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PatchCard({
  editionId,
  patchId,
  patch,
  locale,
  activeStepId,
  applied,
  onApplied,
  onRevealEditor,
  onNavigateToStep,
  onRequestManualClarification,
}: {
  editionId: string;
  patchId: string;
  patch: EventAiWizardPatch;
  locale: string;
  activeStepId: EventAiAssistantStepId;
  applied: boolean;
  onApplied: (appliedState: EventAiWizardAppliedState) => void;
  onRevealEditor: (target?: EventAiWizardEditorFocusTarget) => void;
  onNavigateToStep: (stepId: EventAiAssistantStepId) => void;
  onRequestManualClarification: (query: string) => void;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const router = useRouter();
  const [isApplying, setIsApplying] = useState(false);
  const [selectedLocationCandidate, setSelectedLocationCandidate] =
    useState<EventAiWizardResolvedLocationCandidate | null>(null);

  useEffect(() => {
    setSelectedLocationCandidate(
      patch.locationResolution?.status === 'matched' ? patch.locationResolution.candidate : null,
    );
  }, [patch]);

  const effectivePatch = useMemo(() => {
    if (!selectedLocationCandidate) return patch;
    return buildPatchWithSelectedLocation(patch, selectedLocationCandidate);
  }, [patch, selectedLocationCandidate]);
  const requiresLocationSelection = Boolean(patch.choiceRequest && !selectedLocationCandidate);

  function formatOpLabel(op: EventAiWizardOp): string {
    switch (op.type) {
      case 'update_edition': {
        const fields: string[] = [];
        if (op.data.startsAt) fields.push(t('ops.fields.date'));
        if (op.data.locationDisplay || op.data.city || op.data.state) {
          fields.push(t('ops.fields.location'));
        }
        if (op.data.editionLabel) fields.push(t('ops.fields.label'));
        if (op.data.description) fields.push(t('ops.fields.description'));
        if (!fields.length) fields.push(t('ops.fields.details'));
        return t('ops.updateEvent', { fields: fields.join(', ') });
      }
      case 'create_distance': {
        const unit = op.data.distanceUnit ?? 'km';
        const value = op.data.distanceValue ? `${op.data.distanceValue}${unit}` : '';
        const money = formatCurrency(locale, resolvePriceCents(op.data), 'MXN');
        return t('ops.addDistance', {
          label: op.data.label,
          value: value ? ` (${value})` : '',
          price: money,
        });
      }
      case 'update_distance_price': {
        const money = formatCurrency(locale, resolvePriceCents(op.data), 'MXN');
        return t('ops.updateDistancePrice', { price: money });
      }
      case 'create_pricing_tier': {
        const money = formatCurrency(locale, resolvePriceCents(op.data), op.data.currency ?? 'MXN');
        const label = op.data.label ?? t('ops.defaultTier');
        return t('ops.addTier', { label, price: money });
      }
      case 'create_faq_item':
        return t('ops.addFaq', { question: op.data.question });
      case 'create_waiver':
        return t('ops.addWaiver', { title: op.data.title });
      case 'create_question':
        return t('ops.addQuestion', { prompt: op.data.prompt });
      case 'create_add_on': {
        const money = formatCurrency(
          locale,
          resolvePriceCents({
            priceCents: op.data.optionPriceCents,
            price: op.data.optionPrice,
          }),
          'MXN',
        );
        return t('ops.addAddOn', { title: op.data.title, price: money });
      }
      case 'append_website_section_markdown':
        return t('ops.appendWebsite', { section: t(`ops.sections.${op.data.section}`) });
      case 'append_policy_markdown':
        return t('ops.appendPolicy', { policy: t(`ops.policies.${op.data.policy}`) });
      case 'update_policy_config':
        return t('ops.updatePolicies');
    }
  }

  async function applyPatch() {
    if (isApplying || applied) return;
    setIsApplying(true);
    try {
      const res = await fetch('/api/events/ai-wizard/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editionId, locale, patch: effectivePatch }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { code?: string; category?: string; applied?: unknown }
          | null;
        if (data?.code === 'PRO_REQUIRED') {
          toast.error(t('errors.proRequired'));
          return;
        }
        if (data?.code === 'FEATURE_DISABLED') {
          toast.error(t('errors.disabled'));
          return;
        }
        if (data?.code === 'RATE_LIMITED') {
          toast.error(t('errors.rateLimited'));
          return;
        }
        if (data?.code === 'READ_ONLY') {
          toast.error(t('errors.readOnlyDescription'));
          return;
        }
        if (data?.code === 'SAFETY_BLOCKED') {
          if (data.category === 'prompt_injection') {
            toast.error(t('errors.safety.promptInjection'));
            return;
          }
          toast.error(t('errors.safety.policyViolation'));
          return;
        }
        if (data?.code === 'INVALID_PATCH') {
          toast.error(t('errors.invalid'));
          return;
        }
        if (data?.code === 'RETRY_LATER') {
          toast.error(t('errors.retryLater'));
          return;
        }
        if (Array.isArray(data?.applied) && data.applied.length > 0) {
          toast.error(t('errors.partialApplied'));
          onApplied(buildAppliedState({ patchId, patch: effectivePatch, activeStepId }));
          router.refresh();
          return;
        }
        toast.error(t('errors.failed'));
        return;
      }

      toast.success(t('applied'));
      const shouldRevealLocationInEditor =
        activeStepId === 'basics' &&
        effectivePatch.ops.some(
          (op) =>
            op.type === 'update_edition' &&
            Boolean(op.data.locationDisplay && op.data.latitude?.trim() && op.data.longitude?.trim()),
        );
      const shouldRevealBasicsEditor =
        activeStepId === 'basics' &&
        effectivePatch.ops.some((op) => op.type === 'update_edition');
      if (shouldRevealLocationInEditor) {
        onApplied(buildAppliedState({ patchId, patch: effectivePatch, activeStepId }));
        onRevealEditor('location');
        return;
      }
      if (shouldRevealBasicsEditor) {
        onApplied(buildAppliedState({ patchId, patch: effectivePatch, activeStepId }));
        onRevealEditor();
        return;
      }
      onApplied(buildAppliedState({ patchId, patch: effectivePatch, activeStepId }));
      router.refresh();
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <article className="mt-3 rounded-2xl border border-border/60 bg-background/65 p-4 shadow-sm animate-in fade-in slide-in-from-bottom-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{effectivePatch.title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{effectivePatch.summary}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={applied ? 'secondary' : 'default'}
          disabled={isApplying || applied || requiresLocationSelection}
          onClick={applyPatch}
          className="w-full shrink-0 sm:w-auto"
        >
          {applied ? <Check className="mr-2 h-4 w-4" /> : null}
          {isApplying ? t('applying') : applied ? t('applied') : t('apply')}
        </Button>
      </div>

      <MarkdownOutputsList outputs={effectivePatch.markdownOutputs ?? []} />
      {effectivePatch.choiceRequest ? (
        <LocationChoiceRequestCard
          request={effectivePatch.choiceRequest}
          selectedCandidate={selectedLocationCandidate}
          onSelectCandidate={setSelectedLocationCandidate}
          onRevealEditor={onRevealEditor}
          onRequestManualClarification={onRequestManualClarification}
        />
      ) : null}
      {effectivePatch.locationResolution && !effectivePatch.choiceRequest ? (
        <LocationResolutionCard resolution={effectivePatch.locationResolution} />
      ) : null}
      {effectivePatch.crossStepIntent ? (
        <CrossStepHandoffCard handoff={effectivePatch.crossStepIntent} onNavigateToStep={onNavigateToStep} />
      ) : null}

      <details className="mt-3 rounded-2xl border border-border/60 bg-background/55 p-3">
        <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
          {t('latestProposal.detailsTitle')}
        </summary>
        <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
          <ul className="space-y-1 text-sm text-muted-foreground">
            {effectivePatch.ops.map((op, idx) => (
              <li key={`${patchId}-${idx}`} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                <span className="min-w-0">{formatOpLabel(op)}</span>
              </li>
            ))}
          </ul>
          <RoutingCard
            checklist={effectivePatch.missingFieldsChecklist ?? []}
            intentRouting={(effectivePatch.intentRouting ?? []).filter((item) => {
              if (!effectivePatch.crossStepIntent) return true;

              const blockedStepIds = new Set<EventAiAssistantStepId>([
                effectivePatch.crossStepIntent.primaryTargetStepId,
                ...(effectivePatch.crossStepIntent.secondaryTargetStepIds ?? []),
              ]);

              return !blockedStepIds.has(item.stepId);
            })}
            onNavigateToStep={onNavigateToStep}
          />
        </div>
      </details>
    </article>
  );
}

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
  const normalizedInitialBrief = initialEventBrief?.trim() ?? '';
  const [input, setInput] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.sessionStorage.getItem(draftStorageKey) ?? '';
  });
  const [appliedPatchIds, setAppliedPatchIds] = useState<Set<string>>(() => new Set());
  const [eventBrief, setEventBrief] = useState(normalizedInitialBrief);
  const [briefDraft, setBriefDraft] = useState(normalizedInitialBrief);
  const [isEditingBrief, setIsEditingBrief] = useState(false);
  const [isPersistingBrief, setIsPersistingBrief] = useState(false);
  const [progressState, setProgressState] = useState<EventAiWizardProgressState | null>(null);
  const [fastPathStructure, setFastPathStructure] = useState<EventAiWizardFastPathStructure | null>(null);
  const [earlyProseLead, setEarlyProseLead] = useState<EventAiWizardEarlyProseLead | null>(null);
  const [lastSentText, setLastSentText] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [latencyMarks, setLatencyMarks] = useState<EventAiWizardLatencyMarks>({
    requestStartedAt: null,
    firstProgressAt: null,
    firstStructureAt: null,
    firstTextAt: null,
    proposalReadyAt: null,
  });
  const [continuitySnapshot] = useState<EventAiWizardContinuitySnapshot | null>(() => {
      if (typeof window === 'undefined') return null;

      const rawSnapshot = window.sessionStorage.getItem(continuityStorageKey);
      if (!rawSnapshot) return null;

      try {
        return JSON.parse(rawSnapshot) as EventAiWizardContinuitySnapshot;
      } catch {
        window.sessionStorage.removeItem(continuityStorageKey);
        return null;
      }
    });
  const [lastAppliedPatch, setLastAppliedPatch] = useState<EventAiWizardAppliedState | null>(null);

  function resolveBriefErrorMessage(code?: string) {
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
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const value = eventBrief.trim();
    if (!value) {
      window.sessionStorage.removeItem(briefStorageKey);
      return;
    }
    window.sessionStorage.setItem(briefStorageKey, value);
  }, [briefStorageKey, eventBrief]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(draftStorageKey, input);
  }, [draftStorageKey, input]);

  const { messages, sendMessage, status, stop, error: chatError, clearError } =
    useChat<EventAiWizardUIMessage>({
      transport: new DefaultChatTransport({
        api: '/api/events/ai-wizard',
        body: { editionId, stepId, locale, eventBrief: eventBrief.trim() || null },
      }),
      onData: (part) => {
        if (part.type === 'data-notification') {
          setLatencyMarks((current) =>
            current.requestStartedAt && !current.firstProgressAt
              ? { ...current, firstProgressAt: Date.now() }
              : current,
          );
          setProgressState(part.data);
          return;
        }
        if (part.type === 'data-fast-path-structure') {
          setFastPathStructure(part.data);
          setLatencyMarks((current) =>
            current.requestStartedAt && !current.firstStructureAt
              ? { ...current, firstStructureAt: Date.now() }
              : current,
          );
          return;
        }
        if (part.type === 'data-early-prose') {
          setEarlyProseLead(part.data);
        }
      },
    });

  const renderedMessages = useMemo(() => messages.filter((message) => message.role !== 'system'), [messages]);
  const latestUserMessageIndex = useMemo(() => {
    for (let index = renderedMessages.length - 1; index >= 0; index -= 1) {
      if (renderedMessages[index]?.role === 'user') {
        return index;
      }
    }

    return -1;
  }, [renderedMessages]);
  const latestVisibleUserMessage =
    latestUserMessageIndex >= 0 ? renderedMessages[latestUserMessageIndex] : null;
  const latestProposalMessageIndex = useMemo(() => {
    for (let index = renderedMessages.length - 1; index >= 0; index -= 1) {
      const message = renderedMessages[index];
      if (message.role === 'assistant' && message.parts.some(isEventPatchPart)) {
        return index;
      }
    }

    return -1;
  }, [renderedMessages]);
  const latestAuthoritativeProposalIndex =
    latestProposalMessageIndex >= 0 && latestProposalMessageIndex > latestUserMessageIndex
      ? latestProposalMessageIndex
      : -1;
  const latestProposalMessage =
    latestAuthoritativeProposalIndex >= 0 ? renderedMessages[latestAuthoritativeProposalIndex] : null;
  const latestProposalPatchPart = latestProposalMessage
    ? [...latestProposalMessage.parts.filter(isEventPatchPart)].at(-1) ?? null
    : null;
  const latestProposalText = latestProposalMessage ? getMessageText(latestProposalMessage) : '';
  const latestRequestIndex = useMemo(() => {
    if (latestAuthoritativeProposalIndex < 0) return -1;

    for (let index = latestAuthoritativeProposalIndex - 1; index >= 0; index -= 1) {
      if (renderedMessages[index]?.role === 'user') {
        return index;
      }
    }

    return -1;
  }, [latestAuthoritativeProposalIndex, renderedMessages]);
  const latestRequestMessage = latestRequestIndex >= 0 ? renderedMessages[latestRequestIndex] : null;
  const archiveMessages = useMemo(() => {
    if (latestAuthoritativeProposalIndex < 0) {
      return renderedMessages;
    }

    const cutoffIndex =
      latestRequestIndex >= 0 ? latestRequestIndex : latestAuthoritativeProposalIndex;
    return renderedMessages.slice(0, cutoffIndex);
  }, [latestAuthoritativeProposalIndex, latestRequestIndex, renderedMessages]);
  const isBusy = status === 'submitted' || status === 'streaming';
  const hasSavedBrief = eventBrief.trim().length > 0;
  const hasBriefDraftChanges = briefDraft.trim() !== eventBrief.trim();
  const parsedChatError = parseChatErrorPayload(chatError);
  const latestAssistantWithoutPatch = useMemo(() => {
    if (latestProposalMessage) return null;

    for (let index = renderedMessages.length - 1; index >= 0; index -= 1) {
      const message = renderedMessages[index];
      if (message?.role !== 'assistant') continue;
      if (index <= latestUserMessageIndex) return null;
      const text = getMessageText(message);
      if (text) {
        return text;
      }
    }

    return null;
  }, [latestProposalMessage, latestUserMessageIndex, renderedMessages]);
  const visibleProgressState =
    latestProposalMessage || (!isBusy && !chatError) ? null : progressState;
  const firstProgressMs =
    latencyMarks.requestStartedAt && latencyMarks.firstProgressAt
      ? latencyMarks.firstProgressAt - latencyMarks.requestStartedAt
      : null;
  const firstTextMs =
    latencyMarks.requestStartedAt && latencyMarks.firstTextAt
      ? latencyMarks.firstTextAt - latencyMarks.requestStartedAt
      : null;
  const firstStructureMs =
    latencyMarks.requestStartedAt && latencyMarks.firstStructureAt
      ? latencyMarks.firstStructureAt - latencyMarks.requestStartedAt
      : null;
  const proposalReadyMs =
    latencyMarks.requestStartedAt && latencyMarks.proposalReadyAt
      ? latencyMarks.proposalReadyAt - latencyMarks.requestStartedAt
      : null;
  const activeElapsedMs = latencyMarks.requestStartedAt
    ? (latencyMarks.proposalReadyAt ?? nowMs) - latencyMarks.requestStartedAt
    : null;
  const shouldShowSlowScaffold =
    !latestProposalMessage &&
    !fastPathStructure &&
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
    if (!chatError) return;
    if (!latestProposalMessage && !lastAppliedPatch) return;
    clearError();
  }, [chatError, clearError, lastAppliedPatch, latestProposalMessage]);

  useEffect(() => {
    if (!latencyMarks.requestStartedAt || latencyMarks.firstTextAt || !latestAssistantWithoutPatch) {
      return;
    }

    const timer = window.setTimeout(() => {
      setLatencyMarks((current) =>
        current.requestStartedAt && !current.firstTextAt
          ? { ...current, firstTextAt: Date.now() }
          : current,
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, [latencyMarks.firstTextAt, latencyMarks.requestStartedAt, latestAssistantWithoutPatch]);

  useEffect(() => {
    if (!latencyMarks.requestStartedAt || latencyMarks.proposalReadyAt || !latestProposalMessage) {
      return;
    }

    const timer = window.setTimeout(() => {
      const timestamp = Date.now();
      setLatencyMarks((current) =>
        current.requestStartedAt && !current.proposalReadyAt
          ? {
              ...current,
              firstTextAt: current.firstTextAt ?? (latestProposalText ? timestamp : null),
              proposalReadyAt: timestamp,
            }
          : current,
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, [latencyMarks.proposalReadyAt, latencyMarks.requestStartedAt, latestProposalMessage, latestProposalText]);

  useEffect(() => {
    if (!latencyMarks.requestStartedAt || latencyMarks.firstStructureAt || !slowScaffoldKey) {
      return;
    }

    const timer = window.setTimeout(() => {
      setLatencyMarks((current) =>
        current.requestStartedAt && !current.firstStructureAt
          ? { ...current, firstStructureAt: Date.now() }
          : current,
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, [latencyMarks.firstStructureAt, latencyMarks.requestStartedAt, slowScaffoldKey]);

  useEffect(() => {
    if (!isBusy || !latencyMarks.requestStartedAt || latencyMarks.proposalReadyAt) return;

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 500);

    return () => window.clearInterval(timer);
  }, [isBusy, latencyMarks.proposalReadyAt, latencyMarks.requestStartedAt]);

  function resolveProgressContent(code: EventAiWizardNotificationCode | null) {
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
  }

  function resolveSlowFeedback(elapsedMs: number | null) {
    if (!elapsedMs || !isBusy) return null;

    if (elapsedMs >= 8000) {
      return {
        title: t('latency.verySlow.title'),
        description: t('latency.verySlow.description'),
      };
    }

    if (elapsedMs >= 4000) {
      return {
        title: t('latency.slow.title'),
        description: t('latency.slow.description'),
      };
    }

    return null;
  }

  const slowFeedback = resolveSlowFeedback(activeElapsedMs);
  const visibleProgressContent = resolveProgressContent(
    visibleProgressState?.code ?? 'analyzing_request',
  );
  const activeProgressLabel = slowFeedback?.title ?? visibleProgressContent.title;
  const activeProgressDescription = slowFeedback?.description ?? visibleProgressContent.description;
  const activeProgressEmphasis = slowFeedback ? 'slow' : 'normal';
  const shouldShowAnimatedProgress =
    !!visibleProgressState && !latestAssistantWithoutPatch;
  const recoveredContinuitySnapshot =
    !latestProposalMessage &&
    !isBusy &&
    continuitySnapshot &&
    continuitySnapshot.sourceStepId !== stepId
      ? continuitySnapshot
      : null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!latestRequestMessage && !latestProposalMessage) return;

    const snapshot: EventAiWizardContinuitySnapshot = {
      sourceStepId: stepId,
      latestRequestMessage,
      latestProposalMessage,
      latestProposalText,
      latestProposalPatch: latestProposalPatchPart
        ? {
            title: latestProposalPatchPart.data.title,
            summary: latestProposalPatchPart.data.summary,
          }
        : null,
    };

    window.sessionStorage.setItem(continuityStorageKey, JSON.stringify(snapshot));
  }, [
    continuityStorageKey,
    latestProposalMessage,
    latestProposalPatchPart,
    latestProposalText,
    latestRequestMessage,
    stepId,
  ]);

  function resolveChatErrorMessage() {
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
  }

  async function persistEventBrief(nextBrief: string) {
    const trimmedBrief = nextBrief.trim();
    setIsPersistingBrief(true);
    const result = await updateEventEdition({
      editionId,
      organizerBrief: trimmedBrief || null,
    });
    setIsPersistingBrief(false);

    if (!result.ok) {
      toast.error(resolveBriefErrorMessage(result.code));
      return false;
    }

    setEventBrief(trimmedBrief);
    setBriefDraft(trimmedBrief);
    setIsEditingBrief(false);
    router.refresh();
    return true;
  }

  async function handleSaveBrief() {
    if (!hasBriefDraftChanges) {
      setIsEditingBrief(false);
      return;
    }

    await persistEventBrief(briefDraft);
  }

  async function handleSend(nextText?: string) {
    const text = (nextText ?? input).trim();
    if (!text || isBusy) return;
    if (status === 'error') {
      clearError();
    }
    const requestStartedAt = Date.now();
    setLatencyMarks({
      requestStartedAt,
      firstProgressAt: null,
      firstStructureAt: null,
      firstTextAt: null,
      proposalReadyAt: null,
    });
    setNowMs(requestStartedAt);
    setProgressState({ code: 'analyzing_request', level: 'info' });
    setFastPathStructure(null);
    setEarlyProseLead(null);
    setLastSentText(text);
    setLastAppliedPatch(null);
    sendMessage({ text });
    setInput('');
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(draftStorageKey);
    }
  }

  function handleNavigateToStep(nextStepId: EventAiAssistantStepId) {
    const url = new URL(window.location.href);
    url.searchParams.set('wizard', '1');
    url.searchParams.set('step', nextStepId);
    router.push(`${url.pathname}${url.search}` as never);
  }

  function handleRevealEditor(target?: EventAiWizardEditorFocusTarget) {
    if (typeof window !== 'undefined' && target) {
      window.sessionStorage.setItem(editorFocusStorageKey, target);
    }
    setAssistantOpen(false);
  }

  function handleReuseRequest(requestText: string) {
    setInput(requestText);
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(requestText.length, requestText.length);
    });
  }

  function handleRequestManualLocationClarification(query: string) {
    const prompt = t('locationResolution.choice.manualClarificationPrompt', { query });
    setInput(prompt);
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(prompt.length, prompt.length);
    });
  }

  return (
    <section
      className={cn(
        'overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/65 dark:border-white/8 dark:bg-[#0d1017]/96 dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]',
        embeddedInWorkspace && 'border-none bg-transparent shadow-none backdrop-blur-0 supports-[backdrop-filter]:bg-transparent',
      )}
      data-latency-request-started-at={latencyMarks.requestStartedAt ?? undefined}
      data-latency-first-progress-ms={firstProgressMs ?? undefined}
      data-latency-first-structure-ms={firstStructureMs ?? undefined}
      data-latency-first-text-ms={firstTextMs ?? undefined}
      data-latency-proposal-ready-ms={proposalReadyMs ?? undefined}
    >
      {embeddedInWorkspace ? (
        <div className="px-1 pb-1 pt-2 sm:px-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{t('inline.title', { step: stepTitle })}</p>
            {markdownFocus ? (
              <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary">
                {t('inline.markdownBadge')}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t('contract')}</p>
        </div>
      ) : (
        <header className="border-b border-border/60 px-4 py-4 sm:px-5 sm:py-5 dark:border-white/8">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {t('inline.title', { step: stepTitle })}
                </h2>
                {markdownFocus ? (
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {t('inline.markdownBadge')}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t('inline.description')}</p>
              <p className="mt-2 text-xs text-muted-foreground">{t('contract')}</p>
            </div>
          </div>
        </header>
      )}

      <div className="space-y-5 px-4 py-4 sm:px-5">
        {recoveredContinuitySnapshot ? (
          <ContinuitySnapshotCard
            snapshot={recoveredContinuitySnapshot}
            onReuseRequest={handleReuseRequest}
          />
        ) : null}

        {lastAppliedPatch ? (
          <AppliedConfirmationCard
            appliedState={lastAppliedPatch}
            onRevealEditor={handleRevealEditor}
            onNavigateToStep={handleNavigateToStep}
          />
        ) : null}

        {latestProposalMessage ? (
          <section className="rounded-2xl border border-border/60 bg-background/55 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none">
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/18 bg-primary/[0.05] px-4 py-3 dark:border-primary/20 dark:bg-primary/[0.08]">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {t('latestProposal.title')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{t('latestProposal.description')}</p>
              </div>

              {latestProposalPatchPart ? (
                <PatchCard
                  editionId={editionId}
                  patchId={latestProposalPatchPart.id ?? `${latestProposalMessage.id}-patch`}
                  patch={latestProposalPatchPart.data}
                  locale={locale}
                  activeStepId={stepId}
                  applied={appliedPatchIds.has(
                    latestProposalPatchPart.id ?? `${latestProposalMessage.id}-patch`,
                  )}
                  onApplied={(appliedState) => {
                    const patchId =
                      latestProposalPatchPart.id ?? `${latestProposalMessage.id}-patch`;
                    setAppliedPatchIds((prev) => new Set([...prev, patchId]));
                    setLastAppliedPatch(appliedState);
                  }}
                  onRevealEditor={handleRevealEditor}
                  onNavigateToStep={handleNavigateToStep}
                  onRequestManualClarification={handleRequestManualLocationClarification}
                />
              ) : null}

              <SupportingContextPanel
                latestRequestMessage={latestRequestMessage}
                latestProposalMessage={latestProposalMessage}
                latestProposalText={latestProposalText}
                archiveMessages={archiveMessages}
              />
            </div>
          </section>
        ) : renderedMessages.length > 0 ? (
          <section className="rounded-2xl border border-border/60 bg-background/55 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('latestProposal.pendingTitle')}
            </p>
            <div className="mt-3 space-y-3">
              {latestVisibleUserMessage ? <RequestSummaryCard message={latestVisibleUserMessage} /> : null}
              {shouldShowAnimatedProgress ? (
                <AnimatedProgressLabel
                  label={activeProgressLabel}
                  description={activeProgressDescription}
                  emphasis={activeProgressEmphasis}
                />
              ) : null}
              {earlyProseLead ? <EarlyProseLeadCard lead={earlyProseLead} /> : null}
              {fastPathStructure ? <FastPathStructureCard structure={fastPathStructure} /> : null}
              {slowScaffoldKey ? <SlowProposalScaffoldCard scaffoldKey={slowScaffoldKey} /> : null}
              {latestAssistantWithoutPatch ? (
                <ConversationExcerpt
                  label={t('latestProposal.responseLabel')}
                  text={latestAssistantWithoutPatch}
                  tone="assistant"
                  renderMarkdown
                />
              ) : null}
            </div>
          </section>
        ) : isBusy || visibleProgressState ? (
          <section className="rounded-2xl border border-border/60 bg-background/55 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('latestProposal.pendingTitle')}
            </p>
            <div className="mt-3 space-y-3">
              {shouldShowAnimatedProgress ? (
                <AnimatedProgressLabel
                  label={activeProgressLabel}
                  description={activeProgressDescription}
                  emphasis={activeProgressEmphasis}
                />
              ) : null}
              {earlyProseLead ? <EarlyProseLeadCard lead={earlyProseLead} /> : null}
              {fastPathStructure ? <FastPathStructureCard structure={fastPathStructure} /> : null}
              {slowScaffoldKey ? <SlowProposalScaffoldCard scaffoldKey={slowScaffoldKey} /> : null}
              {latestAssistantWithoutPatch ? (
                <ConversationExcerpt
                  label={t('latestProposal.responseLabel')}
                  text={latestAssistantWithoutPatch}
                  tone="assistant"
                  renderMarkdown
                />
              ) : null}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-border/60 bg-background/35 p-4 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.025]">
            <p className="font-medium text-foreground">{t('empty.heading')}</p>
            <p className="mt-1 leading-6">{t('empty.example')}</p>
          </section>
        )}

        <section className="rounded-2xl border border-border/60 bg-background/65 px-4 py-4 shadow-sm sm:px-5 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
          <label htmlFor={composerId} className="sr-only">
            {t('composer.label')}
          </label>
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{t('composer.sectionTitle')}</p>
              <p id={composerHintId} className="mt-1 text-xs leading-5 text-muted-foreground">
                {hasSavedBrief ? t('composer.savedBriefHint') : t('composer.briefHint')}
              </p>
              <p className="mt-3 text-sm font-medium text-foreground">{t('composer.roughNotesTitle')}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t('composer.roughNotesExample')}
              </p>
            </div>

            <textarea
              id={composerId}
              ref={composerRef}
              aria-describedby={composerHintId}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t('placeholder')}
              disabled={isBusy}
              rows={5}
              className={cn(
                'min-h-[150px] w-full resize-y rounded-2xl border border-border/60 bg-background px-4 py-3 text-sm shadow-sm outline-none ring-offset-background transition sm:min-h-[180px] dark:border-primary/35 dark:bg-black/40 dark:shadow-none',
                'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'disabled:opacity-60',
              )}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
            />

            <div className="grid gap-2 sm:flex sm:flex-wrap">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-auto justify-start rounded-xl px-4 py-2.5 text-left text-sm leading-5 whitespace-normal sm:max-w-[22rem]"
                  onClick={() => setInput(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>

            <div className="flex justify-end">
              {isBusy ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => stop()}
                  className="w-full sm:min-w-32 sm:w-auto"
                >
                  <Square className="mr-2 size-4" />
                  {t('stop')}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleSend()}
                  disabled={input.trim().length === 0}
                  className="w-full sm:min-w-32 sm:w-auto"
                >
                  <Send className="mr-2 size-4" />
                  {t('send')}
                </Button>
              )}
            </div>
          </div>
        </section>

        <details className="rounded-2xl border border-border/50 bg-background/40 p-4 dark:border-white/8 dark:bg-white/[0.025]" open={isEditingBrief}>
          <summary className="cursor-pointer list-none">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('brief.savedLabel')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{t('brief.description')}</p>
              </div>

              {!isEditingBrief ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={(event) => {
                    event.preventDefault();
                    setBriefDraft(eventBrief);
                    setIsEditingBrief(true);
                  }}
                >
                  {hasSavedBrief ? t('brief.edit') : t('brief.add')}
                </Button>
              ) : null}
            </div>
          </summary>

          <div className="mt-4 border-t border-border/60 pt-4 dark:border-white/8">
            {isEditingBrief ? (
              <div className="space-y-3">
                <label htmlFor={briefEditorId} className="sr-only">
                  {t('brief.inputLabel')}
                </label>
                <p id={briefEditorHintId} className="text-xs leading-5 text-muted-foreground">
                  {t('brief.inputHint')}
                </p>
                <textarea
                  id={briefEditorId}
                  aria-describedby={briefEditorHintId}
                  value={briefDraft}
                  onChange={(event) => setBriefDraft(event.target.value)}
                  rows={5}
                  className={cn(
                    'min-h-[136px] w-full resize-y rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background transition dark:border-white/10 dark:bg-black/35 dark:shadow-none',
                    'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    'disabled:opacity-60',
                  )}
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPersistingBrief || !hasBriefDraftChanges}
                    className="w-full sm:w-auto"
                    onClick={handleSaveBrief}
                  >
                    {t('brief.save')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isPersistingBrief}
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setBriefDraft(eventBrief);
                      setIsEditingBrief(false);
                    }}
                  >
                    {t('brief.cancel')}
                  </Button>
                </div>
              </div>
            ) : hasSavedBrief ? (
              <div className="space-y-3">
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{eventBrief}</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      void handleSend(t('brief.useForStepPrompt', { step: stepTitle }));
                    }}
                  >
                    {t('brief.useForStep')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isPersistingBrief}
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      await persistEventBrief('');
                    }}
                  >
                    {t('brief.clear')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-foreground">{t('brief.empty')}</p>
                <p className="text-xs leading-5 text-muted-foreground">{t('brief.emptyHint')}</p>
              </div>
            )}
          </div>
        </details>

        {chatError ? (
          <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            <p className="font-medium">{t('errors.title')}</p>
            <p className="mt-1 text-xs text-destructive/80">{resolveChatErrorMessage()}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
