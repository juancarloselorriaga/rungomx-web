import { normalizeMyRegistrationStatus } from '@/lib/events/my-registrations';

describe('normalizeMyRegistrationStatus', () => {
  const now = new Date('2026-03-01T12:00:00.000Z');

  it('preserves canonical non-expired statuses', () => {
    expect(
      normalizeMyRegistrationStatus({
        status: 'confirmed',
        expiresAt: null,
        now,
      }),
    ).toBe('confirmed');

    expect(
      normalizeMyRegistrationStatus({
        status: 'payment_pending',
        expiresAt: new Date('2026-02-01T12:00:00.000Z'),
        now,
      }),
    ).toBe('payment_pending');
  });

  it('marks started or submitted registrations as expired when the hold has elapsed', () => {
    expect(
      normalizeMyRegistrationStatus({
        status: 'started',
        expiresAt: new Date('2026-03-01T11:59:59.000Z'),
        now,
      }),
    ).toBe('expired');

    expect(
      normalizeMyRegistrationStatus({
        status: 'submitted',
        expiresAt: new Date('2026-03-01T12:00:00.000Z'),
        now,
      }),
    ).toBe('expired');
  });

  it('keeps started or submitted registrations active before expiration', () => {
    expect(
      normalizeMyRegistrationStatus({
        status: 'started',
        expiresAt: new Date('2026-03-01T12:00:01.000Z'),
        now,
      }),
    ).toBe('started');

    expect(
      normalizeMyRegistrationStatus({
        status: 'submitted',
        expiresAt: null,
        now,
      }),
    ).toBe('submitted');
  });

  it('falls back to expired for unknown raw statuses', () => {
    expect(
      normalizeMyRegistrationStatus({
        status: 'unexpected_status',
        expiresAt: null,
        now,
      }),
    ).toBe('expired');
  });
});
