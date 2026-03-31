'use client';

import type { RefObject } from 'react';
import type { UIMessagePart } from 'ai';

import type {
  EventAiWizardApplyLocationChoice,
  EventAiWizardChoiceRequest,
  EventAiWizardCrossStepIntent,
  EventAiWizardIntentRoute,
  EventAiWizardMarkdownOutput,
  EventAiWizardMissingFieldItem,
  EventAiWizardPatch,
} from '@/lib/events/ai-wizard/schemas';
import type {
  EventAiWizardDataTypes,
  EventAiWizardEarlyProseLead,
  EventAiWizardFastPathStructure,
  EventAiWizardNotificationCode,
  EventAiWizardUIMessage,
} from '@/lib/events/ai-wizard/ui-types';
import type { EventSetupWizardStepId } from '@/lib/events/wizard/steps';

export type EventAiAssistantStepId = EventSetupWizardStepId;

export type EventAiWizardPanelProps = {
  editionId: string;
  stepId: EventAiAssistantStepId;
  stepTitle: string;
  suggestions: string[];
  markdownFocus?: boolean;
  initialEventBrief?: string | null;
  embeddedInWorkspace?: boolean;
};

export type UnknownUITools = Record<string, { input: unknown; output: unknown | undefined }>;

export type EventAiWizardChatErrorPayload = {
  code?: string;
  category?: string;
};

export type EventAiWizardProgressState = {
  code: EventAiWizardNotificationCode;
  level: 'info' | 'success' | 'error';
};

export type EventAiWizardLatencyMarks = {
  requestStartedAt: number | null;
  firstProgressAt: number | null;
  firstStructureAt: number | null;
  firstTextAt: number | null;
  proposalReadyAt: number | null;
};

export type EventAiWizardScaffoldKey = 'basics' | 'content' | 'policies' | 'review' | 'generic';

export type EventAiWizardContinuitySnapshot = {
  sourceStepId: EventAiAssistantStepId;
  latestRequestMessage: Pick<EventAiWizardUIMessage, 'id' | 'role' | 'parts'> | null;
  latestProposalMessage: Pick<EventAiWizardUIMessage, 'id' | 'role' | 'parts'> | null;
  latestProposalText: string;
  latestProposalPatch: Pick<EventAiWizardPatch, 'title' | 'summary'> | null;
};

export type EventAiWizardEditorFocusTarget = 'location';

export type EventAiWizardAppliedState = {
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

export type EventAiWizardApplyNotice = {
  kind: 'failed' | 'partial';
  message: string;
};

export type EventAiWizardResolvedLocationCandidate = Extract<
  NonNullable<EventAiWizardPatch['locationResolution']>,
  { status: 'matched' }
>['candidate'];

export type EventAiWizardLocationResolutionPreview =
  | NonNullable<EventAiWizardPatch['locationResolution']>
  | {
      status: 'matched';
      query: string;
      candidate: EventAiWizardResolvedLocationCandidate;
    };

export function isEventPatchPart(
  part: UIMessagePart<EventAiWizardDataTypes, UnknownUITools>,
): part is { type: 'data-event-patch'; id?: string; data: EventAiWizardPatch } {
  return part.type === 'data-event-patch';
}

export function resolvePriceCents(data: { priceCents?: number; price?: number }): number {
  if (data.priceCents !== undefined) return data.priceCents;
  return Math.round((data.price ?? 0) * 100);
}

export function formatCurrency(locale: string, valueCents: number, currency = 'MXN'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(valueCents / 100);
}

export function parseChatErrorPayload(
  error: Error | undefined,
): EventAiWizardChatErrorPayload | null {
  if (!error?.message) return null;

  try {
    const parsed = JSON.parse(error.message) as EventAiWizardChatErrorPayload;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeOrganizerPrompt(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function isBroadOrganizerPrompt(text: string) {
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

export function getMessageText(message: Pick<EventAiWizardUIMessage, 'parts'>): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { text: string }).text.trim())
    .filter(Boolean)
    .join('\n\n');
}

export function getAppliedStepTarget(patch: EventAiWizardPatch): EventAiAssistantStepId | null {
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

export function buildAppliedState(params: {
  patchId: string;
  patch: EventAiWizardPatch;
  activeStepId: EventAiAssistantStepId;
  locationChoice?: EventAiWizardApplyLocationChoice;
}): EventAiWizardAppliedState {
  const { patchId, patch, activeStepId, locationChoice } = params;
  const crossStepTarget = getAppliedStepTarget(patch);

  if (activeStepId === 'basics') {
    const basicsUpdate = patch.ops.find((op) => op.type === 'update_edition');
    if (basicsUpdate?.type === 'update_edition') {
      const savedLocation = Boolean(
        (basicsUpdate.data.locationDisplay &&
          String(basicsUpdate.data.latitude ?? '').trim() &&
          String(basicsUpdate.data.longitude ?? '').trim()) ||
        (patch.choiceRequest?.kind === 'location_candidate_selection' && locationChoice),
      );

      return {
        patchId,
        title: patch.title,
        summary: patch.summary,
        action: {
          kind: 'editor',
          ...(savedLocation ? { target: 'location' as const } : {}),
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

export type ProposalCardPatchProps = {
  editionId: string;
  patchId: string;
  patch: EventAiWizardPatch;
  locale: string;
  activeStepId: EventAiAssistantStepId;
  applied: boolean;
  onApplyStart?: () => void;
  onApplied: (appliedState: EventAiWizardAppliedState) => void;
  onApplyFailure?: (message: string) => void;
  onRevealEditor: (target?: EventAiWizardEditorFocusTarget) => void;
  onNavigateToStep: (stepId: EventAiAssistantStepId) => void;
  onRequestManualClarification: (query: string) => void;
};

export type ProposalRoutingProps = {
  checklist: EventAiWizardMissingFieldItem[];
  intentRouting: EventAiWizardIntentRoute[];
  onNavigateToStep: (stepId: EventAiAssistantStepId) => void;
};

export type ProposalDetailsProps = {
  patchId: string;
  patch: EventAiWizardPatch;
  locale: string;
  locationResolution: EventAiWizardLocationResolutionPreview | undefined;
  selectedCandidate: EventAiWizardResolvedLocationCandidate | null;
  onSelectLocationChoice: (optionIndex: number) => void;
  onRevealEditor: (target?: EventAiWizardEditorFocusTarget) => void;
  onNavigateToStep: (stepId: EventAiAssistantStepId) => void;
  onRequestManualClarification: (query: string) => void;
};

export type SupportingContextProps = {
  latestRequestMessage: EventAiWizardUIMessage | null;
  latestProposalMessage: EventAiWizardUIMessage | null;
  latestProposalText: string;
  archiveMessages: EventAiWizardUIMessage[];
};

export type ContinuitySnapshotProps = {
  snapshot: EventAiWizardContinuitySnapshot;
  onReuseRequest: (requestText: string) => void;
};

export type ApplyConfirmationProps = {
  appliedState: EventAiWizardAppliedState;
  onRevealEditor: (target?: EventAiWizardEditorFocusTarget) => void;
  onNavigateToStep: (stepId: EventAiAssistantStepId) => void;
};

export type ProgressStateCardProps = {
  latestVisibleUserMessage: EventAiWizardUIMessage | null;
  latestAssistantWithoutPatch: string | null;
  visibleProgressLabel?: string;
  visibleProgressDescription?: string;
  progressEmphasis?: 'normal' | 'slow';
  showAnimatedProgress: boolean;
  earlyProseLead: EventAiWizardEarlyProseLead | null;
  fastPathStructure: EventAiWizardFastPathStructure | null;
  slowScaffoldKey: EventAiWizardScaffoldKey | null;
};

export type ComposerProps = {
  composerId: string;
  composerHintId: string;
  input: string;
  isBusy: boolean;
  suggestions: string[];
  hasSavedBrief: boolean;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onSuggestionSelect: (suggestion: string) => void;
  onSend: () => void;
  onStop: () => void;
};

export type BriefEditorProps = {
  briefEditorId: string;
  briefEditorHintId: string;
  eventBrief: string;
  briefDraft: string;
  hasSavedBrief: boolean;
  hasBriefDraftChanges: boolean;
  isEditingBrief: boolean;
  isPersistingBrief: boolean;
  onBriefDraftChange: (value: string) => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSave: () => void;
  onClear: () => void;
  onUseForStep: () => void;
};

export type ProposalMetadata = {
  latestProposalPatchPart: { id?: string; data: EventAiWizardPatch } | null;
  latestProposalMessage: EventAiWizardUIMessage | null;
  latestProposalText: string;
  latestRequestMessage: EventAiWizardUIMessage | null;
  latestVisibleUserMessage: EventAiWizardUIMessage | null;
  archiveMessages: EventAiWizardUIMessage[];
  latestAssistantWithoutPatch: string | null;
};

export type ProposalRenderingData = ProposalMetadata & {
  checklist: EventAiWizardMissingFieldItem[];
  intentRouting: EventAiWizardIntentRoute[];
  crossStepIntent?: EventAiWizardCrossStepIntent;
  markdownOutputs?: EventAiWizardMarkdownOutput[];
  choiceRequest?: EventAiWizardChoiceRequest;
};
