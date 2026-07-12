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

/**
 * Max amount an organizer could withdraw right now: available funds minus
 * outstanding debt, floored at zero. Mirrors the payout quote contract's
 * max-withdrawable derivation (lib/payments/payouts/quote-contract.ts).
 */
export function deriveMaxWithdrawableMinor(buckets: OrganizerWalletBuckets): number {
  return Math.max(buckets.availableMinor - buckets.debtMinor, 0);
}
