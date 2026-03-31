import type { getEventEditionDetail } from '@/lib/events/queries';
import type {
  EventAiWizardApplyLocationChoice,
  EventAiWizardOp,
  EventAiWizardPatch,
} from '@/lib/events/ai-wizard/schemas';

export type EventAiWizardApplyPatch = EventAiWizardPatch;

export type EventAiWizardApplyCore = Pick<
  EventAiWizardPatch,
  'title' | 'summary' | 'risky' | 'ops' | 'markdownOutputs'
>;

export type EventAiWizardApplyEvent = NonNullable<
  Awaited<ReturnType<typeof getEventEditionDetail>>
>;

export type PolicyState = {
  refundsAllowed: boolean;
  refundPolicyText: string | null;
  refundDeadline: string | null;
  transfersAllowed: boolean;
  transferPolicyText: string | null;
  transferDeadline: string | null;
  deferralsAllowed: boolean;
  deferralPolicyText: string | null;
  deferralDeadline: string | null;
};

export type EventAiWizardAppliedOpResult = {
  opIndex: number;
  type: EventAiWizardOp['type'];
  status: 'applied';
  result?: unknown;
  auditLogId?: string;
};

export type EventAiWizardApplyFailureCode =
  | 'INVALID_PATCH'
  | 'INVALID_DISTANCE'
  | 'READ_ONLY'
  | 'RETRY_LATER';

export type EventAiWizardApplyFailure = {
  ok: false;
  outcome: 'rejected';
  code: EventAiWizardApplyFailureCode;
  retryable: boolean;
  failedOpIndex?: number;
  details?: Record<string, unknown>;
  applied: EventAiWizardAppliedOpResult[];
  proposalFingerprint: string;
};

export type EventAiWizardApplySuccess = {
  ok: true;
  outcome: 'applied';
  applied: EventAiWizardAppliedOpResult[];
  proposalFingerprint: string;
};

export type EventAiWizardApplyEngineResult = EventAiWizardApplySuccess | EventAiWizardApplyFailure;

export type EventAiWizardApplyEngineInput = {
  editionId: string;
  locale?: string;
  actorUserId: string;
  organizationId: string;
  event: EventAiWizardApplyEvent;
  patch: EventAiWizardApplyPatch;
  locationChoice?: EventAiWizardApplyLocationChoice;
  core: EventAiWizardApplyCore;
  proposalFingerprint: string;
  requestContext: {
    ipAddress?: string;
    userAgent?: string;
  };
};

export type EventAiWizardOpExecutionSuccess = {
  ok: true;
  appliedOp: EventAiWizardAppliedOpResult;
  policyState: PolicyState;
};

export type EventAiWizardOpExecutionFailure = {
  ok: false;
  code: EventAiWizardApplyFailureCode;
  retryable: boolean;
  details?: Record<string, unknown>;
};

export type EventAiWizardOpExecutionResult =
  | EventAiWizardOpExecutionSuccess
  | EventAiWizardOpExecutionFailure;

export type EventAiWizardPreflightFailure = {
  code: 'INVALID_PATCH' | 'INVALID_DISTANCE';
  details: Record<string, unknown>;
};
