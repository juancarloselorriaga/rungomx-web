import {
  normalizeMessageHistoryForModelConversion,
  resolvePreviousAssistantFastPathKind,
} from '@/lib/events/ai-wizard/server/planning/normalize-message-history';

describe('normalizeMessageHistoryForModelConversion', () => {
  it('drops assistant patches and generated markdown from follow-up history', () => {
    const normalized = normalizeMessageHistoryForModelConversion([
      {
        id: 'msg-user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Redacta contenido para participantes.' }],
      },
      {
        id: 'msg-assistant-1',
        role: 'assistant',
        parts: [
          { type: 'text', text: '## Horarios\nLa salida será el 21 de marzo a las 18:00.' },
          {
            type: 'data-event-patch',
            data: {
              title: 'Horario incorrecto',
              summary: 'Arrastra un horario inventado.',
              ops: [],
              markdownOutputs: [],
            },
          },
        ],
      },
      {
        id: 'msg-user-2',
        role: 'user',
        parts: [{ type: 'text', text: 'Hazlo más claro con lo ya confirmado.' }],
      },
    ]);

    expect(normalized).toEqual([
      expect.objectContaining({
        role: 'user',
        parts: [{ type: 'text', text: 'Redacta contenido para participantes.' }],
      }),
      expect.objectContaining({
        role: 'user',
        parts: [{ type: 'text', text: 'Hazlo más claro con lo ya confirmado.' }],
      }),
    ]);
  });
});

describe('resolvePreviousAssistantFastPathKind', () => {
  it('recovers the previous fast path kind from assistant browser-style history', () => {
    const kind = resolvePreviousAssistantFastPathKind([
      {
        id: 'msg-user',
        role: 'user',
        parts: [{ type: 'text', text: 'Agrega FAQ y resumen del sitio.' }],
      },
      {
        id: 'msg-assistant',
        role: 'assistant',
        parts: [
          {
            type: 'tool-proposeContentBundlePatch',
            toolCallId: 'tool-content-bundle-1',
            state: 'output-available',
            input: {},
            output: { patchId: 'patch-content-bundle-1' },
          },
          {
            type: 'data-event-patch',
            data: {
              title: 'Bundle inicial',
              summary: 'Incluye FAQ y resumen del sitio.',
              ops: [
                {
                  type: 'create_faq_item',
                  editionId: '11111111-1111-4111-8111-111111111111',
                  data: {
                    question: '¿Qué incluye la experiencia?',
                    answerMarkdown: 'Incluye la experiencia confirmada del evento.',
                  },
                },
                {
                  type: 'append_website_section_markdown',
                  editionId: '11111111-1111-4111-8111-111111111111',
                  data: {
                    section: 'overview',
                    markdown: 'Resumen del sitio con solo información confirmada.',
                    locale: 'es',
                  },
                },
              ],
              markdownOutputs: [
                { domain: 'faq', contentMarkdown: 'Incluye la experiencia confirmada del evento.' },
                {
                  domain: 'website',
                  contentMarkdown: 'Resumen del sitio con solo información confirmada.',
                },
              ],
            },
          },
        ],
      },
    ]);

    expect(kind).toBe('content_bundle');
  });
});
