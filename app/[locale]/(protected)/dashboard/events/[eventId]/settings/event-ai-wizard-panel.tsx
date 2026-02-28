'use client';

import { DefaultChatTransport } from 'ai';
import type { UIMessagePart } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useId, useMemo, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Sparkles, Square, Send, Check } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import type {
  EventAiWizardOp,
  EventAiWizardPatch,
  EventAiWizardMarkdownOutput,
  EventAiWizardMissingFieldItem,
  EventAiWizardIntentRoute,
} from '@/lib/events/ai-wizard/schemas';
import type { EventAiWizardDataTypes, EventAiWizardUIMessage } from '@/lib/events/ai-wizard/ui-types';
import {
  getWizardStepNavigationTarget,
  type EventWizardStepId,
} from '@/lib/events/wizard/orchestrator';
import { cn } from '@/lib/utils';

type EventAiWizardPanelProps = {
  editionId: string;
};

type UnknownUITools = Record<string, { input: unknown; output: unknown | undefined }>;

const STEP_IDS: EventWizardStepId[] = [
  'choose_path',
  'event_details',
  'distances',
  'pricing',
  'faq',
  'waivers',
  'questions',
  'policies',
  'website',
  'add_ons',
  'publish',
];

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

function isEventWizardStepId(value: string): value is EventWizardStepId {
  return STEP_IDS.includes(value as EventWizardStepId);
}

function navigateToWizardStep(
  editionId: string,
  stepId: EventWizardStepId,
  router: ReturnType<typeof useRouter>,
) {
  const target = getWizardStepNavigationTarget(editionId, stepId);
  if (target.hardNavigation) {
    window.location.assign(target.href);
    return;
  }
  router.push({ pathname: target.pathname, params: target.params });
}

function MarkdownOutputsList({
  outputs,
}: {
  outputs: EventAiWizardMarkdownOutput[];
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');

  if (!outputs.length) return null;

  return (
    <div className="mt-3 space-y-2 rounded-md border border-border/70 bg-background/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('outputs.title')}
      </p>
      <ul className="space-y-2">
        {outputs.map((output, index) => (
          <li key={`${output.domain}-${index}`} className="rounded border border-border/60 bg-background p-2">
            <p className="text-xs font-medium text-foreground">
              {output.title ?? t(`outputs.domain.${output.domain}`)}
            </p>
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
              {output.contentMarkdown}
            </p>
          </li>
        ))}
      </ul>
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
  onNavigateToStep: (stepId: EventWizardStepId) => void;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');

  if (!checklist.length && !intentRouting.length) return null;

  return (
    <div className="mt-3 space-y-3 rounded-md border border-primary/20 bg-primary/5 p-3">
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
                  'w-full rounded border px-2 py-1.5 text-left text-xs transition',
                  item.severity === 'blocker'
                    ? 'border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10'
                    : item.severity === 'required'
                      ? 'border-amber-300/60 bg-amber-50 text-amber-900 hover:bg-amber-100'
                      : 'border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10',
                )}
                onClick={() => onNavigateToStep(item.stepId)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {intentRouting.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('routing.intentTitle')}
          </p>
          <ul className="space-y-2">
            {intentRouting.map((item, index) => (
              <li
                key={`${item.intent}-${item.stepId}-${index}`}
                className="rounded border border-border/70 bg-background/80 px-2 py-1.5 text-xs"
              >
                <p className="font-medium text-foreground">{item.intent}</p>
                {item.rationale ? (
                  <p className="mt-1 text-muted-foreground">{item.rationale}</p>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-1 h-7 px-2 text-xs"
                  onClick={() => onNavigateToStep(item.stepId)}
                >
                  {t('routing.goToStep')}
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
  applied,
  onApplied,
}: {
  editionId: string;
  patchId: string;
  patch: EventAiWizardPatch;
  locale: string;
  applied: boolean;
  onApplied: () => void;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const router = useRouter();
  const [isApplying, setIsApplying] = useState(false);

  function formatOpLabel(op: EventAiWizardOp): string {
    switch (op.type) {
      case 'update_edition': {
        const fields: string[] = [];
        if (op.data.startsAt) fields.push(t('ops.fields.date'));
        if (op.data.locationDisplay || op.data.city || op.data.state) {
          fields.push(t('ops.fields.location'));
        }
        if (op.data.editionLabel) fields.push(t('ops.fields.label'));
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
    }
  }

  const checklist = (patch.missingFieldsChecklist ?? []).filter((item) =>
    isEventWizardStepId(item.stepId),
  );
  const intentRouting = (patch.intentRouting ?? []).filter((item) =>
    isEventWizardStepId(item.stepId),
  );

  async function applyPatch() {
    if (isApplying || applied) return;
    setIsApplying(true);
    try {
      const res = await fetch('/api/events/ai-wizard/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editionId, patch }),
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
        if (data?.code === 'SAFETY_BLOCKED') {
          if (data.category === 'prompt_injection') {
            toast.error(t('errors.safety.promptInjection'));
            return;
          }
          toast.error(t('errors.safety.policyViolation'));
          return;
        }
        if (Array.isArray(data?.applied) && data.applied.length > 0) {
          toast.error(t('errors.partialApplied'));
          onApplied();
          router.refresh();
          return;
        }
        toast.error(t('errors.failed'));
        return;
      }

      toast.success(t('applied'));
      onApplied();
      router.refresh();
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <article className="mt-3 rounded-xl border border-border/70 bg-card/80 p-4 shadow-sm animate-in fade-in slide-in-from-bottom-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{patch.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{patch.summary}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={applied ? 'secondary' : 'default'}
          disabled={isApplying || applied}
          onClick={applyPatch}
          className="shrink-0"
        >
          {applied ? <Check className="mr-2 h-4 w-4" /> : null}
          {isApplying ? t('applying') : applied ? t('applied') : t('apply')}
        </Button>
      </div>

      <ul className="mt-3 space-y-1 border-t border-border/60 pt-3 text-sm text-muted-foreground">
        {patch.ops.map((op, idx) => (
          <li key={`${patchId}-${idx}`} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
            <span className="min-w-0">{formatOpLabel(op)}</span>
          </li>
        ))}
      </ul>

      <MarkdownOutputsList outputs={patch.markdownOutputs ?? []} />
      <RoutingCard
        checklist={checklist}
        intentRouting={intentRouting}
        onNavigateToStep={(stepId) => navigateToWizardStep(editionId, stepId, router)}
      />
    </article>
  );
}

export function EventAiWizardPanel({ editionId }: EventAiWizardPanelProps) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const locale = useLocale();
  const composerId = useId();
  const composerHintId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [appliedPatchIds, setAppliedPatchIds] = useState<Set<string>>(() => new Set());

  const { messages, sendMessage, status, stop, error: chatError, clearError } =
    useChat<EventAiWizardUIMessage>({
      transport: new DefaultChatTransport({
        api: '/api/events/ai-wizard',
        body: { editionId },
      }),
      onData: (part) => {
        if (part.type === 'data-notification') {
          return;
        }
      },
      onFinish: () => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      },
    });

  const renderedMessages = useMemo(() => messages.filter((message) => message.role !== 'system'), [messages]);
  const isBusy = status === 'submitted' || status === 'streaming';

  function handleSend() {
    const text = input.trim();
    if (!text || isBusy) return;
    if (status === 'error') {
      clearError();
    }
    sendMessage({ text });
    setInput('');
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 0);
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="border-b px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
            <p className="text-sm text-muted-foreground">{t('description')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('contract')}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 px-5 py-4 sm:px-6">
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-label={t('historyLabel')}
          tabIndex={0}
          className={cn(
            'h-full max-h-full overflow-y-auto rounded-lg border bg-background/60 p-4 shadow-inner',
            'scrollbar-thin',
          )}
        >
          {chatError ? (
            <div
              role="alert"
              className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <p className="font-medium">{t('errors.title')}</p>
              <p className="mt-1 text-xs text-destructive/80">{chatError.message}</p>
            </div>
          ) : null}

          {renderedMessages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{t('empty.heading')}</p>
              <p className="mt-1">{t('empty.example')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {renderedMessages.map((message) => {
                const roleLabel = message.role === 'user' ? t('messages.user') : t('messages.assistant');
                return (
                  <div key={message.id} className="space-y-2">
                    <div
                      className={cn(
                        'max-w-[92%] rounded-2xl border px-3 py-2.5 text-sm leading-relaxed shadow-sm',
                        message.role === 'user'
                          ? 'ml-auto border-primary/20 bg-primary text-primary-foreground'
                          : 'mr-auto border-border/70 bg-background text-foreground',
                        'animate-in fade-in slide-in-from-bottom-1',
                      )}
                    >
                      <p className="sr-only">{roleLabel}</p>
                      {message.parts
                        .filter((part) => part.type === 'text')
                        .map((part, idx) => (
                          <p key={`${message.id}-text-${idx}`}>{(part as { text: string }).text}</p>
                        ))}
                    </div>

                    {message.role === 'assistant'
                      ? message.parts
                          .filter(isEventPatchPart)
                          .map((part, idx) => {
                            const patchId = part.id ?? `${message.id}-patch-${idx}`;
                            return (
                              <PatchCard
                                key={patchId}
                                editionId={editionId}
                                patchId={patchId}
                                patch={part.data}
                                locale={locale}
                                applied={appliedPatchIds.has(patchId)}
                                onApplied={() => setAppliedPatchIds((prev) => new Set([...prev, patchId]))}
                              />
                            );
                          })
                      : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <footer className="border-t bg-card/95 px-5 py-4 sm:px-6">
        <label htmlFor={composerId} className="sr-only">
          {t('composer.label')}
        </label>
        <p id={composerHintId} className="mb-3 text-xs text-muted-foreground">
          {t('composer.hint')}
        </p>
        <div className="flex flex-col gap-3">
          <textarea
            id={composerId}
            aria-describedby={composerHintId}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t('placeholder')}
            disabled={isBusy}
            rows={4}
            className={cn(
              'min-h-[110px] w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background transition',
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

          <div className="flex justify-end">
            {isBusy ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => stop()}
                className="min-w-32"
              >
                <Square className="mr-2 size-4" />
                {t('stop')}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={handleSend}
                disabled={input.trim().length === 0}
                className="min-w-32"
              >
                <Send className="mr-2 size-4" />
                {t('send')}
              </Button>
            )}
          </div>
        </div>
      </footer>
    </section>
  );
}
