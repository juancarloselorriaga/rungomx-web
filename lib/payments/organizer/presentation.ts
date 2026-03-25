export type OrganizerPayoutReasonFamily =
  | 'activePayout'
  | 'manualReview'
  | 'bankRejected'
  | 'processing'
  | 'paused'
  | 'failed'
  | 'genericReview';

export type OrganizerPayoutRequestErrorKey =
  | 'notEligible'
  | 'amountExceedsAvailable'
  | 'queueNotNeeded'
  | 'queueAlreadyExists';

type OrganizerEventTranslationKeys = {
  titleKey: string;
  descriptionKey: string;
};

const organizerQueueEventTranslationKeys = {
  'payout.queued': {
    titleKey: 'wallet.queue.events.payoutQueued.title',
    descriptionKey: 'wallet.queue.events.payoutQueued.description',
  },
  'payout.requested': {
    titleKey: 'wallet.queue.events.payoutRequested.title',
    descriptionKey: 'wallet.queue.events.payoutRequested.description',
  },
  'payout.processing': {
    titleKey: 'wallet.queue.events.payoutProcessing.title',
    descriptionKey: 'wallet.queue.events.payoutProcessing.description',
  },
  'payout.paused': {
    titleKey: 'wallet.queue.events.payoutPaused.title',
    descriptionKey: 'wallet.queue.events.payoutPaused.description',
  },
  'payout.resumed': {
    titleKey: 'wallet.queue.events.payoutResumed.title',
    descriptionKey: 'wallet.queue.events.payoutResumed.description',
  },
  'payout.completed': {
    titleKey: 'wallet.queue.events.payoutCompleted.title',
    descriptionKey: 'wallet.queue.events.payoutCompleted.description',
  },
  'payout.failed': {
    titleKey: 'wallet.queue.events.payoutFailed.title',
    descriptionKey: 'wallet.queue.events.payoutFailed.description',
  },
  'payout.adjusted': {
    titleKey: 'wallet.queue.events.payoutAdjusted.title',
    descriptionKey: 'wallet.queue.events.payoutAdjusted.description',
  },
  'debt_control.pause_required': {
    titleKey: 'wallet.queue.events.debtPauseRequired.title',
    descriptionKey: 'wallet.queue.events.debtPauseRequired.description',
  },
  'debt_control.resume_allowed': {
    titleKey: 'wallet.queue.events.debtResumeAllowed.title',
    descriptionKey: 'wallet.queue.events.debtResumeAllowed.description',
  },
  'dispute.opened': {
    titleKey: 'wallet.queue.events.disputeOpened.title',
    descriptionKey: 'wallet.queue.events.disputeOpened.description',
  },
  'subscription.renewal_failed': {
    titleKey: 'wallet.queue.events.subscriptionRenewalFailed.title',
    descriptionKey: 'wallet.queue.events.subscriptionRenewalFailed.description',
  },
  'refund.executed': {
    titleKey: 'wallet.queue.events.refundExecuted.title',
    descriptionKey: 'wallet.queue.events.refundExecuted.description',
  },
} as const satisfies Record<string, OrganizerEventTranslationKeys>;

const organizerQueueFallbackEventCopy = {
  titleKey: 'wallet.queue.genericTitle',
  descriptionKey: 'wallet.queue.genericDescription',
} as const satisfies OrganizerEventTranslationKeys;

const organizerLifecycleEventTranslationKeys = {
  'payout.requested': {
    titleKey: 'detail.events.requested.title',
    descriptionKey: 'detail.events.requested.description',
  },
  'payout.processing': {
    titleKey: 'detail.events.processing.title',
    descriptionKey: 'detail.events.processing.description',
  },
  'payout.paused': {
    titleKey: 'detail.events.paused.title',
    descriptionKey: 'detail.events.paused.description',
  },
  'payout.resumed': {
    titleKey: 'detail.events.resumed.title',
    descriptionKey: 'detail.events.resumed.description',
  },
  'payout.completed': {
    titleKey: 'detail.events.completed.title',
    descriptionKey: 'detail.events.completed.description',
  },
  'payout.failed': {
    titleKey: 'detail.events.failed.title',
    descriptionKey: 'detail.events.failed.description',
  },
  'payout.adjusted': {
    titleKey: 'detail.events.adjusted.title',
    descriptionKey: 'detail.events.adjusted.description',
  },
} as const satisfies Record<string, OrganizerEventTranslationKeys>;

const organizerLifecycleFallbackEventCopy = {
  titleKey: 'detail.events.genericTitle',
  descriptionKey: 'detail.events.genericDescription',
} as const satisfies OrganizerEventTranslationKeys;

export function shortIdentifier(value: string, size = 8): string {
  const normalized = value.trim();
  if (normalized.length <= size) return normalized;
  return normalized.slice(0, size);
}

function normalizeOrganizerCode(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function resolveOrganizerEventCopyKeys<
  TTranslationKeys extends Record<string, OrganizerEventTranslationKeys>,
  TFallbackCopy extends OrganizerEventTranslationKeys,
>(params: {
  code: string | null | undefined;
  translationKeys: TTranslationKeys;
  fallbackCopy: TFallbackCopy;
}): TTranslationKeys[keyof TTranslationKeys] | TFallbackCopy {
  const normalized = normalizeOrganizerCode(params.code);
  const knownKeys = normalized
    ? params.translationKeys[normalized as keyof TTranslationKeys]
    : undefined;

  if (knownKeys) {
    return knownKeys;
  }

  return params.fallbackCopy;
}

export function getOrganizerQueueEventCopy(
  eventName: string | null | undefined,
): (typeof organizerQueueEventTranslationKeys)[keyof typeof organizerQueueEventTranslationKeys] | typeof organizerQueueFallbackEventCopy {
  return resolveOrganizerEventCopyKeys({
    code: eventName,
    translationKeys: organizerQueueEventTranslationKeys,
    fallbackCopy: organizerQueueFallbackEventCopy,
  });
}

export function getOrganizerPayoutLifecycleEventCopy(
  eventName: string | null | undefined,
): (typeof organizerLifecycleEventTranslationKeys)[keyof typeof organizerLifecycleEventTranslationKeys] | typeof organizerLifecycleFallbackEventCopy {
  return resolveOrganizerEventCopyKeys({
    code: eventName,
    translationKeys: organizerLifecycleEventTranslationKeys,
    fallbackCopy: organizerLifecycleFallbackEventCopy,
  });
}

export function getOrganizerPayoutReasonFamily(
  reasonCode: string | null | undefined,
): OrganizerPayoutReasonFamily {
  const normalized = reasonCode?.trim().toLowerCase() ?? '';

  if (!normalized) return 'genericReview';
  if (normalized.startsWith('active_') || normalized.includes('lifecycle_conflict')) {
    return 'activePayout';
  }
  if (normalized.includes('manual_review')) {
    return 'manualReview';
  }
  if (normalized.includes('bank') && (normalized.includes('reject') || normalized.includes('failed'))) {
    return 'bankRejected';
  }
  if (normalized.includes('processing')) {
    return 'processing';
  }
  if (normalized.includes('pause')) {
    return 'paused';
  }
  if (normalized.includes('fail') || normalized.includes('reject')) {
    return 'failed';
  }

  return 'genericReview';
}

export function getOrganizerPayoutRequestErrorKey(
  code: string | null | undefined,
): OrganizerPayoutRequestErrorKey | null {
  const normalized = code?.trim().toUpperCase() ?? '';

  switch (normalized) {
    case 'PAYOUT_NOT_ELIGIBLE':
      return 'notEligible';
    case 'PAYOUT_REQUEST_EXCEEDS_MAX_WITHDRAWABLE':
      return 'amountExceedsAvailable';
    case 'PAYOUT_QUEUE_ELIGIBLE_FOR_IMMEDIATE':
      return 'queueNotNeeded';
    case 'PAYOUT_QUEUE_ALREADY_ACTIVE':
      return 'queueAlreadyExists';
    default:
      return null;
  }
}
