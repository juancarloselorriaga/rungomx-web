import { resolveOrganizerPayoutCtaMode } from '@/lib/payments/organizer/ui';

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
});
