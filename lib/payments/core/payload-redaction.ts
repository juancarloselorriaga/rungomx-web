const REDACTED_TOKEN_PREFIX = '[REDACTED';
const REDACTION_POLICY_VERSION = 'v1';

type SensitiveFieldClass =
  | 'payment_instrument'
  | 'bank_account'
  | 'contact'
  | 'secret'
  | 'free_text';

type SensitiveFieldRule = {
  className: SensitiveFieldClass;
  matches: (normalizedKey: string) => boolean;
};

const sensitiveFieldRules: SensitiveFieldRule[] = [
  {
    className: 'payment_instrument',
    matches: (key) => key.includes('cardnumber') || key === 'pan' || key.includes('paymenttoken'),
  },
  {
    className: 'bank_account',
    matches: (key) =>
      key.includes('bankaccount') ||
      key.includes('accountnumber') ||
      key.includes('routingnumber') ||
      key.includes('clabe'),
  },
  {
    className: 'contact',
    matches: (key) => key.includes('email') || key.includes('phone'),
  },
  {
    className: 'secret',
    matches: (key) =>
      key.includes('secret') ||
      key.includes('password') ||
      key.includes('token') ||
      key.includes('apikey') ||
      key.includes('cvv') ||
      key.includes('cvc'),
  },
  {
    className: 'free_text',
    matches: (key) =>
      key === 'reason' ||
      key === 'internalnote' ||
      key === 'adminrisknotes' ||
      key === 'manualreviewnotes' ||
      key === 'fraudsignal' ||
      key === 'risksignals',
  },
];

type RedactionAccumulator = {
  redactedPaths: string[];
  redactionClasses: Set<SensitiveFieldClass>;
};

function normalizeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function resolveSensitiveFieldClass(key: string): SensitiveFieldClass | null {
  const normalized = normalizeKey(key);
  for (const rule of sensitiveFieldRules) {
    if (rule.matches(normalized)) return rule.className;
  }
  return null;
}

function makeRedactedToken(className: SensitiveFieldClass): string {
  return `${REDACTED_TOKEN_PREFIX}_${className.toUpperCase()}]`;
}

function redactValue(
  value: unknown,
  path: string,
  acc: RedactionAccumulator,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) => redactValue(entry, `${path}[${index}]`, acc));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(input)) {
    const entryPath = path ? `${path}.${key}` : key;
    const sensitiveClass = resolveSensitiveFieldClass(key);

    if (sensitiveClass) {
      output[key] = makeRedactedToken(sensitiveClass);
      acc.redactedPaths.push(entryPath);
      acc.redactionClasses.add(sensitiveClass);
      continue;
    }

    output[key] = redactValue(entry, entryPath, acc);
  }

  return output;
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function sortUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

export type CanonicalPayloadRedactionEvidence = {
  policyVersion: string;
  redacted: boolean;
  redactedFieldCount: number;
  redactedPaths: string[];
  redactionClasses: string[];
};

export type CanonicalEventRedactionResult = {
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  evidence: CanonicalPayloadRedactionEvidence;
};

export function redactCanonicalEventForPersistence(params: {
  payload: unknown;
  metadata: unknown;
}): CanonicalEventRedactionResult {
  const acc: RedactionAccumulator = {
    redactedPaths: [],
    redactionClasses: new Set<SensitiveFieldClass>(),
  };

  const payload = toObject(redactValue(params.payload, 'payload', acc));
  const metadata = toObject(redactValue(params.metadata, 'metadata', acc));

  const redactedPaths = sortUnique(acc.redactedPaths);
  const redactionClasses = Array.from(acc.redactionClasses).sort((left, right) =>
    left.localeCompare(right),
  );

  return {
    payload,
    metadata,
    evidence: {
      policyVersion: REDACTION_POLICY_VERSION,
      redacted: redactedPaths.length > 0,
      redactedFieldCount: redactedPaths.length,
      redactedPaths,
      redactionClasses,
    },
  };
}
