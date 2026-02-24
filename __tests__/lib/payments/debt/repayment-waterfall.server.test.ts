import {
  allocateDebtRepayment,
  classifyDebtMutation,
  classifyDebtShortfallCategory,
  createZeroDebtCategoryBalances,
  debtWaterfallOrder,
  repaymentCapacityFromEvent,
  sumDebtCategoryBalances,
} from '@/lib/payments/debt/repayment-waterfall';

describe('debt repayment waterfall policy', () => {
  it('uses deterministic disputes->refunds->fees repayment order', () => {
    expect(debtWaterfallOrder).toEqual(['disputes', 'refunds', 'fees']);
  });

  it('classifies dispute debt postings into disputes category', () => {
    const mutation = classifyDebtMutation({
      eventName: 'dispute.debt_posted',
      payloadJson: {
        debtAmount: { amountMinor: 1200, currency: 'MXN' },
      },
    });

    expect(mutation).toEqual({
      category: 'disputes',
      amountMinor: 1200,
    });
  });

  it('classifies negative financial adjustments by adjustmentCode', () => {
    const refundMutation = classifyDebtMutation({
      eventName: 'financial.adjustment_posted',
      payloadJson: {
        adjustmentCode: 'refund_chargeback',
        amount: { amountMinor: -500, currency: 'MXN' },
      },
    });
    const disputeMutation = classifyDebtMutation({
      eventName: 'financial.adjustment_posted',
      payloadJson: {
        adjustmentCode: 'dispute_fee',
        amount: { amountMinor: -300, currency: 'MXN' },
      },
    });
    const feeMutation = classifyDebtMutation({
      eventName: 'financial.adjustment_posted',
      payloadJson: {
        adjustmentCode: 'platform_fee_correction',
        amount: { amountMinor: -200, currency: 'MXN' },
      },
    });

    expect(refundMutation).toEqual({ category: 'refunds', amountMinor: 500 });
    expect(disputeMutation).toEqual({ category: 'disputes', amountMinor: 300 });
    expect(feeMutation).toEqual({ category: 'fees', amountMinor: 200 });
  });

  it('allocates repayment in configured category order', () => {
    const result = allocateDebtRepayment(
      {
        disputes: 700,
        refunds: 400,
        fees: 300,
      },
      1000,
    );

    expect(result.repaymentAppliedMinor).toBe(1000);
    expect(result.allocations).toEqual([
      { category: 'disputes', amountMinor: 700 },
      { category: 'refunds', amountMinor: 300 },
    ]);
    expect(result.nextBalances).toEqual({
      disputes: 0,
      refunds: 100,
      fees: 300,
    });
    expect(sumDebtCategoryBalances(result.nextBalances)).toBe(400);
  });

  it('detects repayment capacity from earnings events only', () => {
    expect(
      repaymentCapacityFromEvent({
        eventName: 'payment.captured',
        payloadJson: {
          netAmount: { amountMinor: 1500, currency: 'MXN' },
        },
      }),
    ).toBe(1500);

    expect(
      repaymentCapacityFromEvent({
        eventName: 'financial.adjustment_posted',
        payloadJson: {
          amount: { amountMinor: 250, currency: 'MXN' },
        },
      }),
    ).toBe(250);

    expect(
      repaymentCapacityFromEvent({
        eventName: 'dispute.funds_released',
        payloadJson: {
          amountReleased: { amountMinor: 1000, currency: 'MXN' },
        },
      }),
    ).toBe(0);
  });

  it('maps shortfalls to deterministic debt categories', () => {
    expect(
      classifyDebtShortfallCategory({
        eventName: 'refund.executed',
        payloadJson: {},
      }),
    ).toBe('refunds');

    expect(
      classifyDebtShortfallCategory({
        eventName: 'dispute.opened',
        payloadJson: {},
      }),
    ).toBe('disputes');

    expect(
      classifyDebtShortfallCategory({
        eventName: 'financial.adjustment_posted',
        payloadJson: {
          adjustmentCode: 'platform_fee_correction',
        },
      }),
    ).toBe('fees');
  });

  it('keeps zeroed helper balances deterministic', () => {
    expect(createZeroDebtCategoryBalances()).toEqual({
      disputes: 0,
      refunds: 0,
      fees: 0,
    });
  });
});
