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
  { pattern: /ignora(r)? (todas?|cualquier|las?|tus?) (las )?(instrucciones|indicaciones|reglas)( anteriores)?/i, reason: 'IGNORE_INSTRUCTIONS' },
  { pattern: /ignora(r)? lo anterior/i, reason: 'IGNORE_INSTRUCTIONS' },
  { pattern: /system prompt/i, reason: 'SYSTEM_PROMPT_EXFIL' },
  { pattern: /(prompt|instrucciones?) de sistema/i, reason: 'SYSTEM_PROMPT_EXFIL' },
  { pattern: /(jailbreak|developer mode|dan mode)/i, reason: 'JAILBREAK_ATTEMPT' },
  { pattern: /(modo desarrollador|modo dan|hazte pasar por el sistema)/i, reason: 'JAILBREAK_ATTEMPT' },
  { pattern: /(bypass|disable).*(safety|policy|guardrail)/i, reason: 'SAFETY_BYPASS_ATTEMPT' },
  { pattern: /(omite|desactiva|salta).*(seguridad|pol[ií]tica|guardrails?)/i, reason: 'SAFETY_BYPASS_ATTEMPT' },
  { pattern: /(make up|invent|fabricate).*(details|facts|amenities|logistics|sponsors|parking|faq)/i, reason: 'MAKE_UP_FACTS' },
  { pattern: /(inventa|fabrica|rellena).*(detalles|datos|amenidades|log[ií]stica|patrocinadores|estacionamiento|faq)/i, reason: 'MAKE_UP_FACTS' },
];

const NEGATED_FACT_FABRICATION_PATTERNS: RegExp[] = [
  /(?:do not|don't|please don't)\s+(?:make up|invent|fabricate|fill in)\b/i,
  /(?:^|[\s,.;:])(no|sin)\s+(?:quiero\s+que\s+)?(?:invent(?:es|ar|en)?|fabric(?:a|ar|an)?|rellen(?:a|ar|en)?)(?:\b|$)/i,
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
      if (reason === 'MAKE_UP_FACTS' && NEGATED_FACT_FABRICATION_PATTERNS.some((candidate) => candidate.test(input))) {
        continue;
      }
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
