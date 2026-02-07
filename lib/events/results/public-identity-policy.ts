export const PUBLIC_IDENTITY_POLICY_MODES = [
  'full_name_with_bib',
  'initials_with_bib',
  'bib_only',
] as const;

export type PublicIdentityPolicyMode = (typeof PUBLIC_IDENTITY_POLICY_MODES)[number];

export type PublicIdentityPolicy = {
  mode: PublicIdentityPolicyMode;
};

export const PUBLIC_RESULT_IDENTITY_POLICY_BASELINE: PublicIdentityPolicy = {
  mode: 'full_name_with_bib',
};
export const PUBLIC_RESULT_IDENTITY_POLICY_MODE_ENV_KEY =
  'RESULTS_PUBLIC_IDENTITY_POLICY_MODE';

export type PublicIdentityDisplay = {
  runnerLabel: string;
  bibLabel: string | null;
  policyMode: PublicIdentityPolicyMode;
};

const PUBLIC_IDENTITY_FALLBACK_LABEL = 'Runner';

function toInitials(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) return PUBLIC_IDENTITY_FALLBACK_LABEL;

  return parts
    .map((part) => `${part.charAt(0).toUpperCase()}.`)
    .join(' ');
}

function isPublicIdentityPolicyMode(value: string): value is PublicIdentityPolicyMode {
  return (
    PUBLIC_IDENTITY_POLICY_MODES as readonly string[]
  ).includes(value);
}

export function getPublicResultIdentityPolicy(config?: {
  mode?: string | null;
}): PublicIdentityPolicy {
  const configuredMode =
    config?.mode ??
    process.env[PUBLIC_RESULT_IDENTITY_POLICY_MODE_ENV_KEY] ??
    null;
  const normalizedMode = configuredMode?.trim() ?? '';

  if (isPublicIdentityPolicyMode(normalizedMode)) {
    return { mode: normalizedMode };
  }

  return PUBLIC_RESULT_IDENTITY_POLICY_BASELINE;
}

export function resolvePublicResultIdentityDisplay(
  input: { runnerFullName: string; bibNumber: string | null },
  policy: PublicIdentityPolicy = PUBLIC_RESULT_IDENTITY_POLICY_BASELINE,
): PublicIdentityDisplay {
  const normalizedName = input.runnerFullName.trim();
  const normalizedBib = input.bibNumber?.trim() || null;

  switch (policy.mode) {
    case 'initials_with_bib':
      return {
        runnerLabel: toInitials(normalizedName),
        bibLabel: normalizedBib,
        policyMode: policy.mode,
      };
    case 'bib_only':
      return {
        runnerLabel: normalizedBib ? PUBLIC_IDENTITY_FALLBACK_LABEL : toInitials(normalizedName),
        bibLabel: normalizedBib,
        policyMode: policy.mode,
      };
    default:
      return {
        runnerLabel: normalizedName || PUBLIC_IDENTITY_FALLBACK_LABEL,
        bibLabel: normalizedBib,
        policyMode: policy.mode,
      };
  }
}
