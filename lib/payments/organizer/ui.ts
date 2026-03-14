export type OrganizerWalletBuckets = {
  availableMinor: number;
  processingMinor: number;
  frozenMinor: number;
  debtMinor: number;
};

export type OrganizerWalletSnapshotApiResponse = {
  data: {
    organizerId: string;
    asOf: string;
    buckets: OrganizerWalletBuckets;
    debt: {
      waterfallOrder: readonly string[];
      categoryBalancesMinor: Record<string, number>;
      repaymentAppliedMinor: number;
    };
  };
};

export type OrganizerWalletIssueActivityItem = {
  eventId: string;
  traceId: string;
  eventName: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  state: 'action_needed' | 'in_progress';
  recoveryGuidance: {
    policyCode: string;
    reasonCode: string;
    guidanceCode: string;
    debtMinor: number;
    pauseThresholdMinor: number;
    resumeThresholdMinor: number;
  } | null;
};

export type OrganizerWalletIssuesApiResponse = {
  data: {
    organizerId: string;
    asOf: string;
    actionNeeded: OrganizerWalletIssueActivityItem[];
    inProgress: OrganizerWalletIssueActivityItem[];
  };
};

export type OrganizerPayoutCtaMode = 'request' | 'queue';

export function resolveOrganizerPayoutCtaMode(
  buckets: OrganizerWalletBuckets,
): OrganizerPayoutCtaMode {
  const hasActivePayoutLifecycle = buckets.processingMinor > 0;
  const hasWithdrawableFunds = buckets.availableMinor > 0;

  return !hasActivePayoutLifecycle && hasWithdrawableFunds ? 'request' : 'queue';
}
