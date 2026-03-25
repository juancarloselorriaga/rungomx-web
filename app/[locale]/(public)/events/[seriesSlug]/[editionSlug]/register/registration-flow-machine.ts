import type { PublicEventDetail } from '@/lib/events/queries';

export type RegistrationFlowStep =
  | 'distance'
  | 'info'
  | 'questions'
  | 'addons'
  | 'policies'
  | 'waiver'
  | 'payment'
  | 'confirmation';

type BuildRegistrationStepsInput = {
  activeAddOnCount: number;
  activeQuestionCount: number;
  hasPoliciesStep: boolean;
  resumeRegistrationId: string | undefined;
  waiverCount: number;
};

export function hasPoliciesStep(policy: PublicEventDetail['policyConfig']) {
  if (!policy) return false;
  return (
    policy.refundsAllowed ||
    Boolean(policy.refundPolicyText) ||
    Boolean(policy.refundDeadline) ||
    policy.transfersAllowed ||
    Boolean(policy.transferPolicyText) ||
    Boolean(policy.transferDeadline) ||
    policy.deferralsAllowed ||
    Boolean(policy.deferralPolicyText) ||
    Boolean(policy.deferralDeadline)
  );
}

export function buildRegistrationSteps({
  activeAddOnCount,
  activeQuestionCount,
  hasPoliciesStep,
  resumeRegistrationId,
  waiverCount,
}: BuildRegistrationStepsInput): RegistrationFlowStep[] {
  const steps: RegistrationFlowStep[] = resumeRegistrationId ? ['info'] : ['distance', 'info'];

  if (activeQuestionCount > 0) {
    steps.push('questions');
  }
  if (activeAddOnCount > 0) {
    steps.push('addons');
  }
  if (hasPoliciesStep) {
    steps.push('policies');
  }
  if (waiverCount > 0) {
    steps.push('waiver');
  }

  steps.push('payment', 'confirmation');
  return steps;
}

export function getProgressSteps(steps: RegistrationFlowStep[]) {
  return steps.filter((step) => step !== 'confirmation');
}

export function getStepNumber(
  steps: RegistrationFlowStep[],
  step: RegistrationFlowStep,
): number {
  const index = steps.indexOf(step);
  return index === -1 ? 0 : index + 1;
}

export function getNextStep(
  steps: RegistrationFlowStep[],
  step: RegistrationFlowStep,
): RegistrationFlowStep | null {
  const index = steps.indexOf(step);
  if (index >= 0 && index < steps.length - 1) {
    return steps[index + 1];
  }
  return null;
}

export function getPreviousStep(
  steps: RegistrationFlowStep[],
  step: RegistrationFlowStep,
): RegistrationFlowStep | null {
  const index = steps.indexOf(step);
  if (index > 0) {
    return steps[index - 1];
  }
  return null;
}
