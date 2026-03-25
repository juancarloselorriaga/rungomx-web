export const adminPaymentsCacheTags = {
  netRecognizedFees: 'admin-payments-net-recognized-fees',
  debtDisputeExposure: 'admin-payments-debt-dispute-exposure',
  mxnReport: 'admin-payments-mxn-report',
  paymentCaptureVolume: 'admin-payments-volume',
  paymentCaptureVolumeOrganizers: 'admin-payments-volume-organizers',
  fxRates: 'admin-payments-fx-rates',
  fxActionFlags: 'admin-payments-fx-action-flags',
  fxSnapshots: 'admin-payments-fx-snapshots',
  contextSummary: 'admin-payments-context-summary',
} as const;

export function withWindowTag(baseTag: string, days: number): string {
  return `${baseTag}-${days}d`;
}
