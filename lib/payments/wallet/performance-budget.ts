export type WalletPerformanceEvidence = {
  sampleCount: number;
  p95QueryDurationMs: number;
  overBudgetSampleCount: number;
  sustainedDrift: boolean;
};

const SAMPLE_KEY = 'wallet-overview';
const walletSampleStore = new Map<string, number[]>();

function clampPositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.trunc(value);
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(ratio * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

export function recordWalletPerformanceSample(params: {
  queryDurationMs: number;
  budgetMs: number;
  sampleWindow?: number;
  sustainedDriftThreshold?: number;
}): WalletPerformanceEvidence {
  const sampleWindow = clampPositiveInteger(params.sampleWindow ?? 40, 40);
  const sustainedDriftThreshold = clampPositiveInteger(
    params.sustainedDriftThreshold ?? 3,
    3,
  );

  const duration = Math.max(0, Math.trunc(params.queryDurationMs));
  const budgetMs = Math.max(1, Math.trunc(params.budgetMs));

  const existing = walletSampleStore.get(SAMPLE_KEY) ?? [];
  const next = [...existing, duration].slice(-sampleWindow);
  walletSampleStore.set(SAMPLE_KEY, next);

  const overBudgetSampleCount = next.filter((sample) => sample > budgetMs).length;
  const p95QueryDurationMs = percentile(next, 0.95);
  const sustainedDrift =
    next.length >= sustainedDriftThreshold && overBudgetSampleCount >= sustainedDriftThreshold;

  return {
    sampleCount: next.length,
    p95QueryDurationMs,
    overBudgetSampleCount,
    sustainedDrift,
  };
}

export function resetWalletPerformanceSamplesForTests(): void {
  walletSampleStore.clear();
}
