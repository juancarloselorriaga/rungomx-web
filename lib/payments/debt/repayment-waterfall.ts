export const debtCategories = ['disputes', 'refunds', 'fees'] as const;

export type DebtCategory = (typeof debtCategories)[number];

export type DebtCategoryBalances = Record<DebtCategory, number>;

export const debtWaterfallOrder = ['disputes', 'refunds', 'fees'] as const satisfies readonly DebtCategory[];

export type DebtRepaymentAllocation = {
  category: DebtCategory;
  amountMinor: number;
};

export type DebtProjectionEvent = {
  eventName: string;
  payloadJson: Record<string, unknown>;
};

type DebtMutation = {
  category: DebtCategory;
  amountMinor: number;
};

export type DebtRepaymentAllocationResult = {
  nextBalances: DebtCategoryBalances;
  repaymentAppliedMinor: number;
  allocations: DebtRepaymentAllocation[];
  repaymentAppliedByCategoryMinor: DebtCategoryBalances;
};

const ZERO_CATEGORY_BALANCES: DebtCategoryBalances = {
  disputes: 0,
  refunds: 0,
  fees: 0,
};

function cloneCategoryBalances(balances: DebtCategoryBalances): DebtCategoryBalances {
  return {
    disputes: balances.disputes,
    refunds: balances.refunds,
    fees: balances.fees,
  };
}

function normalizePositiveInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : 0;
}

function readAmountMinor(payload: Record<string, unknown>, key: string): number {
  const candidate = payload[key];
  if (!candidate || typeof candidate !== 'object') {
    return 0;
  }

  const amountMinor = (candidate as Record<string, unknown>).amountMinor;
  return typeof amountMinor === 'number' && Number.isFinite(amountMinor) ? Math.trunc(amountMinor) : 0;
}

function normalizeCode(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function classifyAdjustmentDebtCategory(adjustmentCode: string): DebtCategory {
  if (adjustmentCode.includes('refund')) {
    return 'refunds';
  }

  if (adjustmentCode.includes('dispute') || adjustmentCode.includes('chargeback')) {
    return 'disputes';
  }

  return 'fees';
}

export function createZeroDebtCategoryBalances(): DebtCategoryBalances {
  return { ...ZERO_CATEGORY_BALANCES };
}

export function sumDebtCategoryBalances(balances: DebtCategoryBalances): number {
  return balances.disputes + balances.refunds + balances.fees;
}

export function classifyDebtShortfallCategory(event: DebtProjectionEvent): DebtCategory {
  switch (event.eventName) {
    case 'dispute.opened':
    case 'dispute.debt_posted':
      return 'disputes';
    case 'refund.executed':
      return 'refunds';
    case 'financial.adjustment_posted': {
      const adjustmentCode = normalizeCode(event.payloadJson.adjustmentCode);
      return classifyAdjustmentDebtCategory(adjustmentCode);
    }
    default:
      return 'fees';
  }
}

export function classifyDebtMutation(event: DebtProjectionEvent): DebtMutation | null {
  switch (event.eventName) {
    case 'dispute.debt_posted': {
      const amountMinor = normalizePositiveInt(readAmountMinor(event.payloadJson, 'debtAmount'));
      if (amountMinor <= 0) return null;
      return {
        category: 'disputes',
        amountMinor,
      };
    }
    case 'financial.adjustment_posted': {
      const amountMinor = readAmountMinor(event.payloadJson, 'amount');
      if (amountMinor >= 0) return null;
      const adjustmentCode = normalizeCode(event.payloadJson.adjustmentCode);
      return {
        category: classifyAdjustmentDebtCategory(adjustmentCode),
        amountMinor: normalizePositiveInt(Math.abs(amountMinor)),
      };
    }
    default:
      return null;
  }
}

export function repaymentCapacityFromEvent(event: DebtProjectionEvent): number {
  switch (event.eventName) {
    case 'payment.captured':
      return normalizePositiveInt(readAmountMinor(event.payloadJson, 'netAmount'));
    case 'financial.adjustment_posted': {
      const amountMinor = readAmountMinor(event.payloadJson, 'amount');
      return normalizePositiveInt(amountMinor);
    }
    default:
      return 0;
  }
}

export function applyDebtMutation(
  balances: DebtCategoryBalances,
  mutation: DebtMutation | null,
): DebtCategoryBalances {
  if (!mutation) return cloneCategoryBalances(balances);

  const next = cloneCategoryBalances(balances);
  next[mutation.category] += mutation.amountMinor;
  return next;
}

export function applyDebtShortfall(
  balances: DebtCategoryBalances,
  params: { category: DebtCategory; amountMinor: number },
): DebtCategoryBalances {
  if (params.amountMinor <= 0) {
    return cloneCategoryBalances(balances);
  }

  const next = cloneCategoryBalances(balances);
  next[params.category] += normalizePositiveInt(params.amountMinor);
  return next;
}

export function allocateDebtRepayment(
  balances: DebtCategoryBalances,
  repaymentCapacityMinor: number,
): DebtRepaymentAllocationResult {
  const repaymentBudget = normalizePositiveInt(repaymentCapacityMinor);
  const nextBalances = cloneCategoryBalances(balances);
  const repaymentAppliedByCategoryMinor = createZeroDebtCategoryBalances();
  const allocations: DebtRepaymentAllocation[] = [];

  if (repaymentBudget === 0) {
    return {
      nextBalances,
      repaymentAppliedMinor: 0,
      allocations,
      repaymentAppliedByCategoryMinor,
    };
  }

  let remaining = repaymentBudget;
  for (const category of debtWaterfallOrder) {
    if (remaining === 0) break;
    const outstanding = nextBalances[category];
    if (outstanding <= 0) continue;

    const applied = Math.min(outstanding, remaining);
    nextBalances[category] = outstanding - applied;
    repaymentAppliedByCategoryMinor[category] = applied;
    allocations.push({
      category,
      amountMinor: applied,
    });
    remaining -= applied;
  }

  return {
    nextBalances,
    repaymentAppliedMinor: repaymentBudget - remaining,
    allocations,
    repaymentAppliedByCategoryMinor,
  };
}
