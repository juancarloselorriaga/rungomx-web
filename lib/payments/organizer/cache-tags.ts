export const organizerPaymentsCacheTags = {
  payouts: 'organizer-payments-payouts',
  payoutCount: 'organizer-payments-payout-count',
  payoutDetail: 'organizer-payments-payout-detail',
} as const;

export function organizerPayoutsTag(organizerId: string): string {
  return `${organizerPaymentsCacheTags.payouts}:${organizerId}`;
}

export function organizerPayoutCountTag(organizerId: string): string {
  return `${organizerPaymentsCacheTags.payoutCount}:${organizerId}`;
}

export function organizerPayoutDetailTag(payoutRequestId: string): string {
  return `${organizerPaymentsCacheTags.payoutDetail}:${payoutRequestId}`;
}
