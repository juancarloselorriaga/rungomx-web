'use client';

import { DefaultChatTransport } from 'ai';
import type { UIMessagePart } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useMemo, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Sparkles, Square, Send, Check } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EventAiWizardPatch, EventAiWizardOp } from '@/lib/events/ai-wizard/schemas';
import type { EventAiWizardUIMessage, EventAiWizardDataTypes } from '@/lib/events/ai-wizard/ui-types';
import { useRouter } from '@/i18n/navigation';

type EventAiWizardPanelProps = {
  editionId: string;
};

type UnknownUITools = Record<string, { input: unknown; output: unknown | undefined }>;

function isEventPatchPart(
  part: UIMessagePart<EventAiWizardDataTypes, UnknownUITools>,
): part is { type: 'data-event-patch'; id?: string; data: EventAiWizardPatch } {
  return part.type === 'data-event-patch';
}

function resolvePriceCents(data: { priceCents?: number; price?: number }): number {
  if (data.priceCents !== undefined) return data.priceCents;
  return Math.round((data.price ?? 0) * 100);
}

function formatOpLabel(op: EventAiWizardOp, locale: string): string {
  switch (op.type) {
    case 'update_edition': {
      const pieces: string[] = [];
      if (op.data.startsAt) pieces.push('date');
      if (op.data.locationDisplay || op.data.city || op.data.state) pieces.push('location');
      if (op.data.editionLabel) pieces.push('label');
      if (!pieces.length) pieces.push('details');
      return `Update event ${pieces.join(', ')}`;
    }
    case 'create_distance': {
      const unit = op.data.distanceUnit ?? 'km';
      const value = op.data.distanceValue ? `${op.data.distanceValue}${unit}` : undefined;
      const cents = resolvePriceCents(op.data);
      const money = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'MXN',
        maximumFractionDigits: 2,
      }).format(cents / 100);
      return `Add distance: ${op.data.label}${value ? ` (${value})` : ''} at ${money}`;
    }
    case 'update_distance_price': {
      const cents = resolvePriceCents(op.data);
      const money = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'MXN',
        maximumFractionDigits: 2,
      }).format(cents / 100);
      return `Update distance price to ${money}`;
    }
    case 'create_pricing_tier': {
      const cents = resolvePriceCents(op.data);
      const money = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: op.data.currency ?? 'MXN',
        maximumFractionDigits: 2,
      }).format(cents / 100);
      const label = op.data.label ?? 'Pricing tier';
      return `Add tier: ${label} at ${money}`;
    }
  }
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
          | { code?: string; applied?: unknown }
          | null;
        if (data?.code === 'PRO_REQUIRED') {
          toast.error(t('errors.proRequired'));
          return;
        }
        if (data?.code === 'FEATURE_DISABLED') {
          toast.error(t('errors.disabled'));
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
    <div className="mt-3 rounded-lg border bg-background/60 p-3 shadow-sm animate-in fade-in slide-in-from-bottom-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{patch.title}</p>
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

      <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
        {patch.ops.map((op, idx) => (
          <li key={`${patchId}-${idx}`} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
            <span className="min-w-0">{formatOpLabel(op, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EventAiWizardPanel({ editionId }: EventAiWizardPanelProps) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const locale = useLocale();
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
        // transient server-side notifications
        return;
      }
    },
    onFinish: () => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    },
  });

  const renderedMessages = useMemo(() => {
    return messages.filter((m) => m.role !== 'system');
  }, [messages]);

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
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{t('title')}</p>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'mt-4 max-h-[52vh] overflow-auto rounded-lg border bg-background/40 p-3',
          'scrollbar-thin',
        )}
      >
        {chatError ? (
          <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="font-medium">{t('errors.title')}</p>
            <p className="mt-1 text-xs text-destructive/80">{chatError.message}</p>
          </div>
        ) : null}
        {renderedMessages.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{t('empty.heading')}</p>
            <p className="mt-1">{t('empty.example')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {renderedMessages.map((message) => (
              <div key={message.id} className="space-y-2">
                <div
                  className={cn(
                    'max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm',
                    message.role === 'user'
                      ? 'ml-auto bg-primary text-primary-foreground'
                      : 'mr-auto bg-muted text-foreground',
                    'animate-in fade-in slide-in-from-bottom-1',
                  )}
                >
                  {message.parts
                    .filter((p) => p.type === 'text')
                    .map((p, idx) => (
                      <p key={`${message.id}-text-${idx}`}>{(p as { text: string }).text}</p>
                    ))}
                </div>

                {message.role === 'assistant'
                  ? message.parts
                      .filter(isEventPatchPart)
                      .map((p, idx) => {
                        const patchId = p.id ?? `${message.id}-patch-${idx}`;
                        return (
                          <PatchCard
                            key={patchId}
                            editionId={editionId}
                            patchId={patchId}
                            patch={p.data}
                            locale={locale}
                            applied={appliedPatchIds.has(patchId)}
                            onApplied={() =>
                              setAppliedPatchIds((prev) => new Set([...prev, patchId]))
                            }
                          />
                        );
                      })
                  : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('placeholder')}
          disabled={isBusy}
          rows={2}
          className={cn(
            'min-h-[44px] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background transition',
            'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:opacity-60',
          )}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        {isBusy ? (
          <Button type="button" variant="secondary" onClick={() => stop()} className="shrink-0">
            <Square className="mr-2 size-4" />
            {t('stop')}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSend}
            disabled={input.trim().length === 0}
            className="shrink-0"
          >
            <Send className="mr-2 size-4" />
            {t('send')}
          </Button>
        )}
      </div>
    </section>
  );
}
