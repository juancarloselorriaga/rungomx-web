import type {
  EventAiWizardFastPathKind,
  EventAiWizardUIMessage,
} from '@/lib/events/ai-wizard/ui-types';

function getAssistantHistoryPatchPart(part: unknown) {
  return Boolean(
    part && typeof part === 'object' && (part as { type?: unknown }).type === 'data-event-patch',
  );
}

function looksLikeAssistantGeneratedMarkdown(text: string) {
  return (
    /\n#{1,6}\s/.test(text) ||
    /\n[-*]\s/.test(text) ||
    /\n\d+\.\s/.test(text) ||
    /\*\*[^*]+\*\*/.test(text)
  );
}

function isMinimalAssistantIntentText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > 240) return false;
  if (looksLikeAssistantGeneratedMarkdown(trimmed)) return false;

  return (
    trimmed.endsWith('?') ||
    /^(puedo|quieres|quieres que|si confirmas|si quieres|necesito|te confirmo|would you like|do you want|if you confirm|i need|can you|should i)\b/i.test(
      trimmed,
    )
  );
}

function filterAssistantHistoryParts(parts: unknown[]) {
  if (parts.some((part) => getAssistantHistoryPatchPart(part))) {
    return [];
  }

  return parts.filter((part): part is { type: 'text'; text: string } => {
    if (!part || typeof part !== 'object' || (part as { type?: unknown }).type !== 'text') {
      return false;
    }

    const text =
      typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '';
    return isMinimalAssistantIntentText(text);
  });
}

function resolveFastPathKindFromStructurePart(part: unknown): EventAiWizardFastPathKind | null {
  if (
    !part ||
    typeof part !== 'object' ||
    (part as { type?: unknown }).type !== 'data-fast-path-structure'
  ) {
    return null;
  }

  const data = (part as { data?: unknown }).data;
  const kind = data && typeof data === 'object' ? (data as { kind?: unknown }).kind : null;
  if (
    kind === 'event_description' ||
    kind === 'faq' ||
    kind === 'content_bundle' ||
    kind === 'website_overview' ||
    kind === 'policy'
  ) {
    return kind;
  }

  return null;
}

function resolveFastPathKindFromToolName(toolName: string): EventAiWizardFastPathKind | null {
  switch (toolName) {
    case 'proposeDescriptionPatch':
      return 'event_description';
    case 'proposeFaqPatch':
      return 'faq';
    case 'proposeContentBundlePatch':
      return 'content_bundle';
    case 'proposeWebsiteOverviewPatch':
      return 'website_overview';
    case 'proposePolicyPatch':
      return 'policy';
    default:
      return null;
  }
}

function resolveFastPathKindFromToolPart(part: unknown): EventAiWizardFastPathKind | null {
  if (!part || typeof part !== 'object') {
    return null;
  }

  const rawType = (part as { type?: unknown }).type;
  const toolName =
    typeof rawType === 'string' && rawType.startsWith('tool-')
      ? rawType.slice('tool-'.length)
      : rawType === 'dynamic-tool' && typeof (part as { toolName?: unknown }).toolName === 'string'
        ? (part as { toolName: string }).toolName
        : null;
  return toolName ? resolveFastPathKindFromToolName(toolName) : null;
}

function resolveFastPathKindFromPatchPart(part: unknown): EventAiWizardFastPathKind | null {
  if (
    !part ||
    typeof part !== 'object' ||
    (part as { type?: unknown }).type !== 'data-event-patch'
  ) {
    return null;
  }

  const data = (part as { data?: unknown }).data;
  if (!data || typeof data !== 'object') {
    return null;
  }

  const ops = Array.isArray((data as { ops?: unknown[] }).ops)
    ? (data as { ops: unknown[] }).ops
    : [];
  const markdownOutputs = Array.isArray((data as { markdownOutputs?: unknown[] }).markdownOutputs)
    ? (data as { markdownOutputs: unknown[] }).markdownOutputs
    : [];

  const hasFaqOp = ops.some(
    (op) => op && typeof op === 'object' && (op as { type?: unknown }).type === 'create_faq_item',
  );
  const hasWebsiteOverviewOp = ops.some((op) => {
    if (
      !op ||
      typeof op !== 'object' ||
      (op as { type?: unknown }).type !== 'append_website_section_markdown'
    ) {
      return false;
    }

    const opData = (op as { data?: unknown }).data;
    return (
      opData &&
      typeof opData === 'object' &&
      (opData as { section?: unknown }).section === 'overview'
    );
  });
  const hasPolicyOp = ops.some(
    (op) =>
      op && typeof op === 'object' && (op as { type?: unknown }).type === 'append_policy_markdown',
  );
  const hasDescriptionOp = ops.some((op) => {
    if (!op || typeof op !== 'object' || (op as { type?: unknown }).type !== 'update_edition') {
      return false;
    }

    const opData = (op as { data?: unknown }).data;
    return (
      opData &&
      typeof opData === 'object' &&
      typeof (opData as { description?: unknown }).description === 'string'
    );
  });

  const hasFaqOutput = markdownOutputs.some(
    (output) =>
      output && typeof output === 'object' && (output as { domain?: unknown }).domain === 'faq',
  );
  const hasWebsiteOutput = markdownOutputs.some(
    (output) =>
      output && typeof output === 'object' && (output as { domain?: unknown }).domain === 'website',
  );
  const hasPolicyOutput = markdownOutputs.some(
    (output) =>
      output && typeof output === 'object' && (output as { domain?: unknown }).domain === 'policy',
  );
  const hasDescriptionOutput = markdownOutputs.some(
    (output) =>
      output &&
      typeof output === 'object' &&
      (output as { domain?: unknown }).domain === 'description',
  );

  if ((hasFaqOp || hasFaqOutput) && (hasWebsiteOverviewOp || hasWebsiteOutput)) {
    return 'content_bundle';
  }
  if (hasFaqOp || hasFaqOutput) return 'faq';
  if (hasWebsiteOverviewOp || hasWebsiteOutput) return 'website_overview';
  if (hasPolicyOp || hasPolicyOutput) return 'policy';
  if (hasDescriptionOp || hasDescriptionOutput) return 'event_description';

  return null;
}

export function normalizeMessageHistoryForModelConversion(
  messages: unknown[],
): EventAiWizardUIMessage[] {
  return messages
    .filter((message): message is Record<string, unknown> =>
      Boolean(message && typeof message === 'object'),
    )
    .map((message, index) => {
      const role = message.role;
      if (role !== 'system' && role !== 'user' && role !== 'assistant') {
        return null;
      }

      const rawParts = Array.isArray(message.parts) ? message.parts : null;
      const normalizedParts =
        rawParts && rawParts.length > 0
          ? rawParts
          : typeof message.content === 'string' && message.content.trim()
            ? [{ type: 'text', text: message.content }]
            : [];
      const filteredParts =
        role === 'assistant' ? filterAssistantHistoryParts(normalizedParts) : normalizedParts;

      if (filteredParts.length === 0) {
        return null;
      }

      return {
        ...(message as Record<string, unknown>),
        id: typeof message.id === 'string' && message.id ? message.id : `msg-${index}`,
        role,
        parts: filteredParts,
      } as EventAiWizardUIMessage;
    })
    .filter((message): message is EventAiWizardUIMessage => Boolean(message));
}

export function resolvePreviousAssistantFastPathKind(
  messages: unknown[],
): EventAiWizardFastPathKind | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (
      !message ||
      typeof message !== 'object' ||
      (message as { role?: unknown }).role !== 'assistant'
    ) {
      continue;
    }

    const rawParts = Array.isArray((message as { parts?: unknown[] }).parts)
      ? (message as { parts: unknown[] }).parts
      : [];
    let patchKind: EventAiWizardFastPathKind | null = null;
    let toolKind: EventAiWizardFastPathKind | null = null;

    for (let partIndex = rawParts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = rawParts[partIndex];
      const structureKind = resolveFastPathKindFromStructurePart(part);
      if (structureKind) {
        return structureKind;
      }

      if (!patchKind) {
        patchKind = resolveFastPathKindFromPatchPart(part);
      }
      if (!toolKind) {
        toolKind = resolveFastPathKindFromToolPart(part);
      }
    }

    if (patchKind) return patchKind;
    if (toolKind) return toolKind;
  }

  return null;
}
