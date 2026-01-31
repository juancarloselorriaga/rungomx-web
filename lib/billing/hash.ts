import { createHmac } from 'crypto';

import { PROMO_CODE_PREFIX_LENGTH } from './constants';

type BillingHashSecret = {
  version: number;
  secret: string;
};

const BILLING_SECRET_PREFIX = 'BILLING_HASH_SECRET_V';
const LEGACY_SECRET_KEY = 'BILLING_HASH_SECRET';
let cachedSecrets: BillingHashSecret[] | null = null;

function resolveBillingHashSecrets(): BillingHashSecret[] {
  if (cachedSecrets) return cachedSecrets;

  const secrets = Object.entries(process.env)
    .filter(([key, value]) => key.startsWith(BILLING_SECRET_PREFIX) && value)
    .map(([key, value]) => {
      const version = Number(key.replace(BILLING_SECRET_PREFIX, ''));
      if (!Number.isInteger(version) || version <= 0) return null;
      return { version, secret: value as string };
    })
    .filter((entry): entry is BillingHashSecret => Boolean(entry))
    .sort((a, b) => a.version - b.version);

  const legacySecret = process.env[LEGACY_SECRET_KEY];
  if (legacySecret) {
    const existingIndex = secrets.findIndex((entry) => entry.version === 1);
    if (existingIndex === -1) {
      secrets.push({ version: 1, secret: legacySecret });
      secrets.sort((a, b) => a.version - b.version);
    }
  }

  if (secrets.length === 0) {
    throw new Error('Missing BILLING_HASH_SECRET or BILLING_HASH_SECRET_V1');
  }

  cachedSecrets = secrets;
  return secrets;
}

export function getBillingHashSecrets(): BillingHashSecret[] {
  return resolveBillingHashSecrets();
}

export function getLatestBillingHashSecret(): BillingHashSecret {
  const secrets = resolveBillingHashSecrets();
  return secrets[secrets.length - 1];
}

export function getBillingHashVersions(): number[] {
  return resolveBillingHashSecrets().map((secret) => secret.version);
}

export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hmacHash(secret: string, input: string): string {
  return createHmac('sha256', secret).update(input).digest('hex');
}

export function hashPromoCode(code: string, version?: number) {
  const normalized = normalizePromoCode(code);
  const secret = version
    ? resolveBillingHashSecrets().find((entry) => entry.version === version)
    : getLatestBillingHashSecret();

  if (!secret) {
    throw new Error(`Missing billing hash secret for version ${version}`);
  }

  return {
    version: secret.version,
    normalized,
    hash: hmacHash(secret.secret, normalized),
  };
}

export function hashPromoCodeAllVersions(code: string) {
  const normalized = normalizePromoCode(code);
  return resolveBillingHashSecrets().map((secret) => ({
    version: secret.version,
    normalized,
    hash: hmacHash(secret.secret, normalized),
  }));
}

export function hashEmailAllVersions(email: string) {
  const normalized = normalizeEmail(email);
  return resolveBillingHashSecrets().map((secret) => ({
    version: secret.version,
    normalized,
    hash: hmacHash(secret.secret, normalized),
  }));
}

export function getPromoCodePrefix(code: string, length = PROMO_CODE_PREFIX_LENGTH): string {
  return normalizePromoCode(code).slice(0, length);
}
