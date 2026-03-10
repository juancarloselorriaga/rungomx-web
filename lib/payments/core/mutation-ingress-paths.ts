import {
  moneyMutationIngress,
  moneyMutationIngressInTransaction,
  type MoneyMutationIngressCommand,
  type MoneyMutationIngressTransaction,
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

export function ingestMoneyMutationFromServerActionInTransaction(
  tx: MoneyMutationIngressTransaction,
  input: MoneyMutationIngressPathInput,
) {
  return moneyMutationIngressInTransaction(tx, {
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
