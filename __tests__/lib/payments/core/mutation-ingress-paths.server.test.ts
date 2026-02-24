const mockMoneyMutationIngress = jest.fn();

jest.mock('@/lib/payments/core/mutation-ingress', () => ({
  moneyMutationIngress: (...args: unknown[]) => mockMoneyMutationIngress(...args),
}));

import {
  ingestMoneyMutationFromApi,
  ingestMoneyMutationFromScheduler,
  ingestMoneyMutationFromServerAction,
  ingestMoneyMutationFromWorker,
} from '@/lib/payments/core/mutation-ingress-paths';

describe('money mutation ingress path delegates', () => {
  beforeEach(() => {
    mockMoneyMutationIngress.mockReset();
    mockMoneyMutationIngress.mockResolvedValue({
      traceId: 'trace-1',
      persistedEvents: [],
    });
  });

  it('delegates api path through moneyMutationIngress', async () => {
    await ingestMoneyMutationFromApi({
      traceId: 'trace-1',
      organizerId: 'org-1',
      events: [],
    });

    expect(mockMoneyMutationIngress).toHaveBeenCalledWith({
      traceId: 'trace-1',
      organizerId: 'org-1',
      events: [],
      source: 'api',
    });
  });

  it('delegates server_action path through moneyMutationIngress', async () => {
    await ingestMoneyMutationFromServerAction({
      traceId: 'trace-1',
      organizerId: 'org-1',
      events: [],
    });

    expect(mockMoneyMutationIngress).toHaveBeenCalledWith({
      traceId: 'trace-1',
      organizerId: 'org-1',
      events: [],
      source: 'server_action',
    });
  });

  it('delegates worker path through moneyMutationIngress', async () => {
    await ingestMoneyMutationFromWorker({
      traceId: 'trace-1',
      organizerId: 'org-1',
      events: [],
    });

    expect(mockMoneyMutationIngress).toHaveBeenCalledWith({
      traceId: 'trace-1',
      organizerId: 'org-1',
      events: [],
      source: 'worker',
    });
  });

  it('delegates scheduler path through moneyMutationIngress', async () => {
    await ingestMoneyMutationFromScheduler({
      traceId: 'trace-1',
      organizerId: 'org-1',
      events: [],
    });

    expect(mockMoneyMutationIngress).toHaveBeenCalledWith({
      traceId: 'trace-1',
      organizerId: 'org-1',
      events: [],
      source: 'scheduler',
    });
  });
});

