const mockRequireAuthenticatedUser = jest.fn();
const mockRequireProFeature = jest.fn();
const mockGetEventEditionDetail = jest.fn();
const mockCanUserAccessSeries = jest.fn();
const mockHeaders = jest.fn();

jest.mock('@/lib/auth/guards', () => ({
  requireAuthenticatedUser: (...args: unknown[]) => mockRequireAuthenticatedUser(...args),
}));

jest.mock('@/lib/pro-features/server/guard', () => ({
  ProFeatureAccessError: class ProFeatureAccessError extends Error {
    decision: { status: 'disabled' | 'blocked' };

    constructor(status: 'disabled' | 'blocked' = 'blocked') {
      super('blocked');
      this.decision = { status };
    }
  },
  requireProFeature: (...args: unknown[]) => mockRequireProFeature(...args),
}));

jest.mock('@/lib/events/queries', () => ({
  getEventEditionDetail: (...args: unknown[]) => mockGetEventEditionDetail(...args),
}));

jest.mock('@/lib/events/actions', () => ({
  createDistance: jest.fn(),
  createFaqItem: jest.fn(),
  createWaiver: jest.fn(),
  updateDistancePrice: jest.fn(),
  updateEventEdition: jest.fn(),
  updateEventPolicyConfig: jest.fn(),
}));

jest.mock('@/lib/events/pricing/actions', () => ({
  createPricingTier: jest.fn(),
}));

jest.mock('@/lib/events/questions/actions', () => ({
  createQuestion: jest.fn(),
}));

jest.mock('@/lib/events/website/actions', () => ({
  getWebsiteContent: jest.fn(),
  updateWebsiteContent: jest.fn(),
}));

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({
    allowed: true,
    remaining: 1,
    resetAt: new Date('2026-03-11T00:00:00.000Z'),
  })),
}));

jest.mock('@/lib/organizations/permissions', () => {
  const actual = jest.requireActual('@/lib/organizations/permissions');
  return {
    ...actual,
    canUserAccessSeries: (...args: unknown[]) => mockCanUserAccessSeries(...args),
  };
});

jest.mock('next/headers', () => ({
  headers: (...args: unknown[]) => mockHeaders(...args),
}));

import { POST } from '@/app/api/events/ai-wizard/apply/route';
import { createFaqItem, updateEventEdition, updateEventPolicyConfig } from '@/lib/events/actions';
import { getWebsiteContent, updateWebsiteContent } from '@/lib/events/website/actions';

describe('POST /api/events/ai-wizard/apply', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockRequireProFeature.mockReset();
    mockGetEventEditionDetail.mockReset();
    mockCanUserAccessSeries.mockReset();
    (createFaqItem as jest.Mock).mockReset();
    (updateEventEdition as jest.Mock).mockReset();
    (updateEventPolicyConfig as jest.Mock).mockReset();
    (getWebsiteContent as jest.Mock).mockReset();
    (updateWebsiteContent as jest.Mock).mockReset();

    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false, canViewOrganizersDashboard: true },
    });
    mockHeaders.mockResolvedValue(new Headers());
    mockRequireProFeature.mockResolvedValue(undefined);
    (createFaqItem as jest.Mock).mockResolvedValue({ ok: true, data: { id: 'faq-1' } });
    (updateEventEdition as jest.Mock).mockResolvedValue({ ok: true, data: { id: 'edition-1' } });
    (getWebsiteContent as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        id: 'content-1',
        editionId: '11111111-1111-4111-8111-111111111111',
        locale: 'es',
        blocks: {},
      },
    });
    (updateWebsiteContent as jest.Mock).mockResolvedValue({
      ok: true,
      data: { id: 'content-1' },
    });
    mockGetEventEditionDetail.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      seriesId: 'series-1',
      organizerBrief: null,
      policyConfig: null,
      faqItems: [],
      waivers: [],
      distances: [],
    });
  });

  it('returns READ_ONLY for viewer memberships before applying assistant changes', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'viewer',
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Create FAQ',
            summary: 'Adds one FAQ item.',
            ops: [
              {
                type: 'create_faq_item',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  question: 'What is included?',
                  answerMarkdown: 'Trail access and timing support.',
                },
              },
            ],
            markdownOutputs: [
              {
                domain: 'faq',
                contentMarkdown: 'Trail access and timing support.',
              },
            ],
          },
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'READ_ONLY' });
  });

  it('applies a deterministic policy-config update patch in one write', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });
    mockGetEventEditionDetail.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      seriesId: 'series-1',
      organizerBrief: null,
      faqItems: [],
      waivers: [],
      distances: [],
      policyConfig: {
        refundsAllowed: true,
        refundPolicyText: 'Texto anterior',
        refundDeadline: null,
        transfersAllowed: false,
        transferPolicyText: null,
        transferDeadline: null,
        deferralsAllowed: false,
        deferralPolicyText: null,
        deferralDeadline: null,
      },
    });
    (updateEventPolicyConfig as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        refundsAllowed: true,
        refundPolicyText: '### Reembolsos',
        refundDeadline: '2026-03-15T00:00:00.000Z',
        transfersAllowed: true,
        transferPolicyText: '### Transferencias',
        transferDeadline: '2026-03-22T00:00:00.000Z',
        deferralsAllowed: false,
        deferralPolicyText: '### Diferimientos',
        deferralDeadline: null,
      },
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Aclarar políticas para participantes',
            summary: 'Reescribe las políticas con fechas y reglas confirmadas.',
            ops: [
              {
                type: 'update_policy_config',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  refundsAllowed: true,
                  refundPolicyText: '### Reembolsos',
                  refundDeadline: '2026-03-15T00:00:00.000Z',
                  transfersAllowed: true,
                  transferPolicyText: '### Transferencias',
                  transferDeadline: '2026-03-22T00:00:00.000Z',
                  deferralsAllowed: false,
                  deferralPolicyText: '### Diferimientos',
                  deferralDeadline: null,
                },
              },
            ],
            markdownOutputs: [
              { domain: 'policy', contentMarkdown: '### Reembolsos' },
              { domain: 'policy', contentMarkdown: '### Transferencias' },
              { domain: 'policy', contentMarkdown: '### Diferimientos' },
            ],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(updateEventPolicyConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        editionId: '11111111-1111-4111-8111-111111111111',
        refundDeadline: '2026-03-15T00:00:00.000Z',
        transferDeadline: '2026-03-22T00:00:00.000Z',
        deferralDeadline: null,
      }),
    );
  });

  it('interprets naive edition datetimes in the event timezone before persistence regardless of host timezone', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });
    mockGetEventEditionDetail.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      seriesId: 'series-1',
      slug: 'trail-2026',
      timezone: 'America/Mexico_City',
      organizerBrief: null,
      policyConfig: null,
      faqItems: [],
      waivers: [],
      distances: [],
    });

    const originalTz = process.env.TZ;

    try {
      for (const hostTimeZone of ['UTC', 'Europe/Stockholm']) {
        process.env.TZ = hostTimeZone;

        const response = await POST(
          new Request('http://localhost/api/events/ai-wizard/apply', {
            method: 'POST',
            body: JSON.stringify({
              editionId: '11111111-1111-4111-8111-111111111111',
              locale: 'es',
              patch: {
                title: 'Ajustar horario del evento',
                summary: 'Guarda el horario confirmado en la zona del evento.',
                ops: [
                  {
                    type: 'update_edition',
                    editionId: '11111111-1111-4111-8111-111111111111',
                    data: {
                      startsAt: '2026-10-12T07:00:00',
                      endsAt: '2026-10-12T13:00:00',
                    },
                  },
                ],
                markdownOutputs: [],
              },
            }),
          }),
        );

        expect(response.status).toBe(200);
        expect(updateEventEdition).toHaveBeenLastCalledWith(
          expect.objectContaining({
            editionId: '11111111-1111-4111-8111-111111111111',
            startsAt: '2026-10-12T13:00:00.000Z',
            endsAt: '2026-10-12T19:00:00.000Z',
          }),
        );
      }
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it('passes structured location fields through to edition persistence, including country', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });
    mockGetEventEditionDetail.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      seriesId: 'series-1',
      slug: 'trail-2026',
      timezone: 'America/Mexico_City',
      organizerBrief: null,
      policyConfig: null,
      faqItems: [],
      waivers: [],
      distances: [],
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Confirmar la ubicación del evento',
            summary: 'Guarda la ubicación confirmada con jerarquía estructurada.',
            ops: [
              {
                type: 'update_edition',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  locationDisplay: 'Bosque de Chapultepec, Ciudad de México, México',
                  address: 'Gran Avenida, 11580 Ciudad de México, México',
                  city: 'Ciudad de México',
                  state: 'Ciudad de México',
                  country: 'MX',
                  latitude: '19.41666781',
                  longitude: '-99.18333064',
                },
              },
            ],
            markdownOutputs: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(updateEventEdition).toHaveBeenCalledWith(
      expect.objectContaining({
        editionId: '11111111-1111-4111-8111-111111111111',
        locationDisplay: 'Bosque de Chapultepec, Ciudad de México, México',
        address: 'Gran Avenida, 11580 Ciudad de México, México',
        city: 'Ciudad de México',
        state: 'Ciudad de México',
        country: 'MX',
        latitude: '19.41666781',
        longitude: '-99.18333064',
      }),
    );
  });

  it('preserves explicit offset semantics for edition datetimes', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });
    mockGetEventEditionDetail.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      seriesId: 'series-1',
      slug: 'trail-2026',
      timezone: 'America/Mexico_City',
      organizerBrief: null,
      policyConfig: null,
      faqItems: [],
      waivers: [],
      distances: [],
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Mantener semántica explícita del horario',
            summary: 'Respeta el offset explícito sin doble conversión.',
            ops: [
              {
                type: 'update_edition',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  startsAt: '2026-10-12T07:00:00-06:00',
                  endsAt: '2026-10-12T13:00:00-06:00',
                },
              },
            ],
            markdownOutputs: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(updateEventEdition).toHaveBeenCalledWith(
      expect.objectContaining({
        editionId: '11111111-1111-4111-8111-111111111111',
        startsAt: '2026-10-12T13:00:00.000Z',
        endsAt: '2026-10-12T19:00:00.000Z',
      }),
    );
  });

  it('replaces the website overview content instead of appending duplicate summary text', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });
    (getWebsiteContent as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        id: 'content-1',
        editionId: '11111111-1111-4111-8111-111111111111',
        locale: 'es',
        blocks: {
          overview: {
            type: 'overview',
            title: 'Resumen del sitio',
            content: 'Texto anterior del sitio',
            enabled: true,
          },
        },
      },
    });
    (updateWebsiteContent as jest.Mock).mockResolvedValue({
      ok: true,
      data: { id: 'content-1' },
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Resumen del sitio Distance Smoke 2026',
            summary: 'Versión clara y confiable del resumen del sitio.',
            ops: [
              {
                type: 'append_website_section_markdown',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  section: 'overview',
                  title: 'Resumen del sitio',
                  markdown: 'Texto nuevo del sitio',
                  locale: 'es',
                },
              },
            ],
            markdownOutputs: [{ domain: 'website', contentMarkdown: 'Texto nuevo del sitio' }],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(updateWebsiteContent).toHaveBeenCalledWith({
      editionId: '11111111-1111-4111-8111-111111111111',
      locale: 'es',
      blocks: {
        overview: {
          type: 'overview',
          title: 'Resumen del sitio',
          content: 'Texto nuevo del sitio',
          enabled: true,
        },
      },
    });
  });

  it('does not block grounded mixed patches that say they are avoiding invented logistics', async () => {
    mockCanUserAccessSeries.mockResolvedValue({
      organizationId: 'org-1',
      role: 'owner',
    });

    const response = await POST(
      new Request('http://localhost/api/events/ai-wizard/apply', {
        method: 'POST',
        body: JSON.stringify({
          editionId: '11111111-1111-4111-8111-111111111111',
          locale: 'es',
          patch: {
            title: 'Actualizar contenido confirmado para participantes',
            summary: 'Aclara el overview y el FAQ con datos confirmados, evitando inventar logística o promesas.',
            ops: [
              {
                type: 'create_faq_item',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  question: '¿Qué incluye la inscripción?',
                  answerMarkdown: 'Incluye acceso al evento y seguimiento de tiempos ya confirmados.',
                },
              },
              {
                type: 'append_website_section_markdown',
                editionId: '11111111-1111-4111-8111-111111111111',
                data: {
                  section: 'overview',
                  title: 'Resumen',
                  markdown: 'Contenido redactado solo con la información ya confirmada por el organizador.',
                  locale: 'es',
                },
              },
            ],
            markdownOutputs: [
              {
                domain: 'faq',
                contentMarkdown: 'Incluye acceso al evento y seguimiento de tiempos ya confirmados.',
              },
              {
                domain: 'website',
                contentMarkdown: 'Contenido redactado solo con la información ya confirmada por el organizador.',
              },
            ],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(createFaqItem).toHaveBeenCalledTimes(1);
    expect(updateWebsiteContent).toHaveBeenCalledTimes(1);
  });
});
