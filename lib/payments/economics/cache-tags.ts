export const adminPaymentsCacheTags = {
  netRecognizedFees: 'admin-payments-net-recognized-fees',
  debtDisputeExposure: 'admin-payments-debt-dispute-exposure',
  mxnReport: 'admin-payments-mxn-report',
  fxRates: 'admin-payments-fx-rates',
  fxActionFlags: 'admin-payments-fx-action-flags',
  fxSnapshots: 'admin-payments-fx-snapshots',
} as const;

export function withWindowTag(baseTag: string, days: number): string {
  return `${baseTag}-${days}d`;
}
