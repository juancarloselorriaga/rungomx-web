import { deriveMaxWithdrawableMinor, resolveOrganizerPayoutCtaMode } from '@/lib/payments/organizer/ui';

describe('resolveOrganizerPayoutCtaMode', () => {
  it('returns request when wallet has available funds and no active processing', () => {
    expect(
      resolveOrganizerPayoutCtaMode({
        availableMinor: 100,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 0,
      }),
    ).toBe('request');
  });

  it('returns queue when payout lifecycle is already in processing', () => {
    expect(
      resolveOrganizerPayoutCtaMode({
        availableMinor: 100,
        processingMinor: 1,
        frozenMinor: 0,
        debtMinor: 0,
      }),
    ).toBe('queue');
  });

  it('returns queue when no withdrawable funds are currently available', () => {
    expect(
      resolveOrganizerPayoutCtaMode({
        availableMinor: 0,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 100,
      }),
    ).toBe('queue');
  });

  it('returns queue when debt fully offsets available funds', () => {
    expect(
      resolveOrganizerPayoutCtaMode({
        availableMinor: 5000,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 5000,
      }),
    ).toBe('queue');
  });
});

describe('deriveMaxWithdrawableMinor', () => {
  it('derives max withdrawable as available minus debt, floored at zero', () => {
    expect(
      deriveMaxWithdrawableMinor({
        availableMinor: 5000,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 2000,
      }),
    ).toBe(3000);

    expect(
      deriveMaxWithdrawableMinor({
        availableMinor: 2000,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 5000,
      }),
    ).toBe(0);
  });
});
