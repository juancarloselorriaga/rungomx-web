import type { EventAiWizardPatch } from './schemas';

export type AiWizardSafetyCategory = 'prompt_injection' | 'policy_violation';

export type AiWizardSafetyResult =
  | {
      blocked: false;
    }
  | {
      blocked: true;
      category: AiWizardSafetyCategory;
      reason: string;
    };

const PROMPT_INJECTION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /ignore (all|any|previous|prior) instructions/i, reason: 'IGNORE_INSTRUCTIONS' },
  { pattern: /system prompt/i, reason: 'SYSTEM_PROMPT_EXFIL' },
  { pattern: /(jailbreak|developer mode|dan mode)/i, reason: 'JAILBREAK_ATTEMPT' },
  { pattern: /(bypass|disable).*(safety|policy|guardrail)/i, reason: 'SAFETY_BYPASS_ATTEMPT' },
];

const POLICY_BLOCK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(build|make|create).*(bomb|explosive|weapon)/i, reason: 'WEAPON_REQUEST' },
  { pattern: /(steal|leak|dump).*(password|credential|token|ssn|social security)/i, reason: 'DATA_EXFIL_REQUEST' },
  { pattern: /(sexual|explicit).*(minor|child|underage)/i, reason: 'MINOR_SEXUAL_CONTENT' },
];

export function sanitizeAiWizardText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function evaluatePatterns(
  input: string,
  patterns: Array<{ pattern: RegExp; reason: string }>,
  category: AiWizardSafetyCategory,
): AiWizardSafetyResult {
  for (const { pattern, reason } of patterns) {
    if (pattern.test(input)) {
      return { blocked: true, category, reason };
    }
  }
  return { blocked: false };
}

export function evaluateAiWizardTextSafety(input: string): AiWizardSafetyResult {
  const sanitized = sanitizeAiWizardText(input);
  if (!sanitized) return { blocked: false };

  const injectionResult = evaluatePatterns(
    sanitized,
    PROMPT_INJECTION_PATTERNS,
    'prompt_injection',
  );
  if (injectionResult.blocked) return injectionResult;

  return evaluatePatterns(sanitized, POLICY_BLOCK_PATTERNS, 'policy_violation');
}

export function extractLatestUserText(messages: unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== 'object') continue;
    const entry = message as { role?: unknown; parts?: unknown; content?: unknown };
    if (entry.role !== 'user') continue;

    if (Array.isArray(entry.parts)) {
      const chunks = entry.parts
        .map((part) => {
          if (!part || typeof part !== 'object') return '';
          const textPart = part as { type?: unknown; text?: unknown };
          return textPart.type === 'text' && typeof textPart.text === 'string' ? textPart.text : '';
        })
        .filter(Boolean);
      return sanitizeAiWizardText(chunks.join(' '));
    }

    if (typeof entry.content === 'string') {
      return sanitizeAiWizardText(entry.content);
    }
  }

  return '';
}

function collectPatchText(value: unknown, into: string[]) {
  if (typeof value === 'string') {
    into.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const child of value) collectPatchText(child, into);
    return;
  }

  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) collectPatchText(child, into);
  }
}

export function evaluateAiWizardPatchSafety(patch: EventAiWizardPatch): AiWizardSafetyResult {
  const textValues: string[] = [];
  collectPatchText(patch, textValues);
  return evaluateAiWizardTextSafety(textValues.join(' '));
}
