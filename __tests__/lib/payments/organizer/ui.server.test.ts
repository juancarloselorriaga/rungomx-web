import { deriveMaxWithdrawableMinor } from '@/lib/payments/organizer/ui';

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
