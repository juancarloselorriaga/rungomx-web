export const BILLING_ENTITLEMENT_KEY = 'pro_access' as const;
export const BILLING_PLAN_KEY = 'pro' as const;

const DEFAULT_TRIAL_DAYS = 7;

export const BILLING_TRIAL_DAYS = (() => {
  const raw = process.env.BILLING_TRIAL_DAYS;
  if (!raw) return DEFAULT_TRIAL_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TRIAL_DAYS;
  }
  return Math.floor(parsed);
})();

export const PROMO_CODE_LENGTH = 12;
export const PROMO_CODE_PREFIX_LENGTH = 8;
export const BILLING_TRIAL_EXPIRING_SOON_DAYS = 2;
