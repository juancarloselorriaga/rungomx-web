'use client';

import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import type { EventAiWizardOp } from '@/lib/events/ai-wizard/schemas';
import { cn } from '@/lib/utils';

import { formatCurrency, resolvePriceCents, type ProposalDetailsProps } from '../shared';

function MarkdownOutputsList({
  outputs,
}: {
  outputs: NonNullable<ProposalDetailsProps['patch']['markdownOutputs']>;
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');

  if (!outputs.length) return null;

  const participantFacingDomains = new Set([
    'description',
    'faq',
    'waiver',
    'website',
    'policy',
    'summary',
  ]);

  return (
    <div className="mt-3 space-y-2 rounded-2xl border border-border/70 bg-background/80 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('outputs.title')}
      </p>
      <ul className="space-y-2">
        {outputs.map((output, index) => (
          <li
            key={`${output.domain}-${index}`}
            className="rounded-xl border border-border/60 bg-card p-3"
          >
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
  resolution: NonNullable<ProposalDetailsProps['locationResolution']>;
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
            <li
              key={`${candidate.placeId ?? candidate.formattedAddress}-${index}`}
              className="rounded-xl border border-border/50 bg-background/70 px-3 py-2"
            >
              {candidate.formattedAddress}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-border/60 bg-muted/10 p-4">
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

function LocationChoiceRequestCard({
  request,
  selectedCandidate,
  onSelectCandidate,
  onRevealEditor,
  onRequestManualClarification,
}: Pick<
  ProposalDetailsProps,
  'selectedCandidate' | 'onRevealEditor' | 'onRequestManualClarification'
> & {
  request: NonNullable<ProposalDetailsProps['patch']['choiceRequest']>;
  onSelectCandidate: (optionIndex: number) => void;
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
                  onClick={() => onSelectCandidate(index)}
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
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onRequestManualClarification(request.query)}
        >
          {t('locationResolution.choice.noneOfThese')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onRevealEditor('location')}
        >
          {t('locationResolution.choice.searchInEditor')}
        </Button>
      </div>
    </div>
  );
}

function CrossStepHandoffCard({
  handoff,
  onNavigateToStep,
}: {
  handoff: NonNullable<ProposalDetailsProps['patch']['crossStepIntent']>;
  onNavigateToStep: ProposalDetailsProps['onNavigateToStep'];
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const tPage = useTranslations('pages.dashboardEventSettings');

  const resolveStepLabel = (
    stepId: NonNullable<ProposalDetailsProps['patch']['crossStepIntent']>['primaryTargetStepId'],
  ) => tPage(`wizardShell.steps.${stepId}` as never);
  const resolveIntentReason = (
    intentType: NonNullable<ProposalDetailsProps['patch']['crossStepIntent']>['intentType'],
  ) => t(`handoff.reason.${intentType}` as never);

  const primaryStepLabel = resolveStepLabel(handoff.primaryTargetStepId);
  const sourceStepLabel = resolveStepLabel(handoff.sourceStepId);
  const additionalStepLabels = (handoff.secondaryTargetStepIds ?? []).map((stepId) =>
    resolveStepLabel(stepId),
  );

  return (
    <div className="mt-3 rounded-2xl border border-border/60 bg-muted/10 p-4">
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
          ? t('handoff.descriptionMixed', { currentStep: sourceStepLabel, step: primaryStepLabel })
          : t('handoff.descriptionCrossStep', { step: primaryStepLabel })}
      </p>
      <p className="mt-2 text-sm leading-6 text-foreground">
        {resolveIntentReason(handoff.intentType)}
      </p>
      {additionalStepLabels.length ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t('handoff.secondaryTargets', { steps: additionalStepLabels.join(', ') })}
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
  checklist: ProposalDetailsProps['patch']['missingFieldsChecklist'];
  intentRouting: ProposalDetailsProps['patch']['intentRouting'];
  onNavigateToStep: ProposalDetailsProps['onNavigateToStep'];
}) {
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const tPage = useTranslations('pages.dashboardEventSettings');

  if (!checklist?.length && !intentRouting?.length) return null;

  const normalizeTranslationKey = (key: string) => {
    const withoutPagePrefix = key.startsWith('pages.dashboardEventSettings.')
      ? key.replace('pages.dashboardEventSettings.', '')
      : key;

    if (withoutPagePrefix.startsWith('wizard.steps.')) {
      return withoutPagePrefix.replace('wizard.steps.', 'wizardShell.steps.');
    }

    return withoutPagePrefix;
  };

  const resolveChecklistLabel = (label: string) => {
    const normalizedKey = normalizeTranslationKey(label);
    if (normalizedKey.startsWith('wizard.') || normalizedKey.startsWith('wizardShell.')) {
      return tPage(normalizedKey as never);
    }

    return label;
  };

  const resolveStepLabel = (
    stepId: NonNullable<ProposalDetailsProps['patch']['intentRouting']>[number]['stepId'],
  ) => tPage(`wizardShell.steps.${stepId}` as never);
  const resolveStepAction = (
    stepId: NonNullable<ProposalDetailsProps['patch']['intentRouting']>[number]['stepId'],
  ) => t(`routing.stepActions.${stepId}` as never);
  const resolveIntentLabel = (
    intent: string,
    stepId: NonNullable<ProposalDetailsProps['patch']['intentRouting']>[number]['stepId'],
  ) => {
    const knownLabels: Record<string, string> = {
      draft_website_overview: t('routing.intentLabels.draft_website_overview'),
    };

    return knownLabels[intent] ?? resolveStepAction(stepId);
  };

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

  const stepOrder = {
    basics: 0,
    distances: 1,
    pricing: 2,
    registration: 3,
    policies: 4,
    content: 5,
    extras: 6,
    review: 7,
  } as const;

  const dedupedIntentRouting = (intentRouting ?? [])
    .reduce<
      Array<
        NonNullable<ProposalDetailsProps['patch']['intentRouting']>[number] & {
          label: string;
          priority: number;
        }
      >
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
    }, [])
    .sort((left, right) => stepOrder[left.stepId] - stepOrder[right.stepId]);

  const checklistStepIds = new Set((checklist ?? []).map((item) => item.stepId));
  const visibleIntentRouting = dedupedIntentRouting.filter(
    (item) => !checklistStepIds.has(item.stepId),
  );

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-3">
      {checklist?.length ? (
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

export function ProposalDetails(props: ProposalDetailsProps) {
  const {
    patch,
    patchId,
    locale,
    locationResolution,
    selectedCandidate,
    onSelectLocationChoice,
    onRevealEditor,
    onNavigateToStep,
    onRequestManualClarification,
  } = props;
  const t = useTranslations('pages.dashboardEventSettings.assistant');
  const filteredIntentRouting = (patch.intentRouting ?? []).filter((item) => {
    if (!patch.crossStepIntent) return true;

    const blockedStepIds = new Set([
      patch.crossStepIntent.primaryTargetStepId,
      ...(patch.crossStepIntent.secondaryTargetStepIds ?? []),
    ]);

    return !blockedStepIds.has(item.stepId);
  });

  const formatOpLabel = (op: EventAiWizardOp): string => {
    switch (op.type) {
      case 'update_edition': {
        const fields: string[] = [];
        if (op.data.startsAt) fields.push(t('ops.fields.date'));
        if (op.data.locationDisplay || op.data.city || op.data.state)
          fields.push(t('ops.fields.location'));
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
      case 'update_distance_price':
        return t('ops.updateDistancePrice', {
          price: formatCurrency(locale, resolvePriceCents(op.data), 'MXN'),
        });
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
          resolvePriceCents({ priceCents: op.data.optionPriceCents, price: op.data.optionPrice }),
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
  };

  return (
    <>
      <MarkdownOutputsList outputs={patch.markdownOutputs ?? []} />
      {patch.choiceRequest && !selectedCandidate ? (
        <LocationChoiceRequestCard
          request={patch.choiceRequest}
          selectedCandidate={selectedCandidate}
          onSelectCandidate={onSelectLocationChoice}
          onRevealEditor={onRevealEditor}
          onRequestManualClarification={onRequestManualClarification}
        />
      ) : null}
      {locationResolution && (!patch.choiceRequest || Boolean(selectedCandidate)) ? (
        <LocationResolutionCard resolution={locationResolution} />
      ) : null}
      {patch.crossStepIntent ? (
        <CrossStepHandoffCard handoff={patch.crossStepIntent} onNavigateToStep={onNavigateToStep} />
      ) : null}

      <details className="mt-3 rounded-2xl border border-border/60 bg-muted/10 p-3">
        <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
          {t('latestProposal.detailsTitle')}
        </summary>
        <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
          <ul className="space-y-1 text-sm text-muted-foreground">
            {patch.ops.map((op, idx) => (
              <li key={`${patchId}-${idx}`} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                <span className="min-w-0">{formatOpLabel(op)}</span>
              </li>
            ))}
          </ul>
          <RoutingCard
            checklist={patch.missingFieldsChecklist}
            intentRouting={filteredIntentRouting}
            onNavigateToStep={onNavigateToStep}
          />
        </div>
      </details>
    </>
  );
}
