import {
  moneyMutationIngress,
  type MoneyMutationIngressCommand,
} from '@/lib/payments/core/mutation-ingress';

type MoneyMutationIngressPathInput = Omit<MoneyMutationIngressCommand, 'source'>;

export function ingestMoneyMutationFromApi(input: MoneyMutationIngressPathInput) {
  return moneyMutationIngress({
    ...input,
    source: 'api',
  });
}

export function ingestMoneyMutationFromServerAction(input: MoneyMutationIngressPathInput) {
  return moneyMutationIngress({
    ...input,
    source: 'server_action',
  });
}

export function ingestMoneyMutationFromWorker(input: MoneyMutationIngressPathInput) {
  return moneyMutationIngress({
    ...input,
    source: 'worker',
  });
}

export function ingestMoneyMutationFromScheduler(input: MoneyMutationIngressPathInput) {
  return moneyMutationIngress({
    ...input,
    source: 'scheduler',
  });
}

