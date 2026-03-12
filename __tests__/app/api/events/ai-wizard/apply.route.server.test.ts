const mockRequireAuthenticatedUser = jest.fn();
const mockRequireProFeature = jest.fn();
const mockGetEventEditionDetail = jest.fn();
const mockCanUserAccessSeries = jest.fn();

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

import { POST } from '@/app/api/events/ai-wizard/apply/route';

describe('POST /api/events/ai-wizard/apply', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockRequireProFeature.mockReset();
    mockGetEventEditionDetail.mockReset();
    mockCanUserAccessSeries.mockReset();

    mockRequireAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: { canManageEvents: false, canViewOrganizersDashboard: true },
    });
    mockRequireProFeature.mockResolvedValue(undefined);
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
          },
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'READ_ONLY' });
  });
});
