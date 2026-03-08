import { Link } from '@/i18n/navigation';
import type { ComponentProps } from 'react';

export type AppHref = ComponentProps<typeof Link>['href'];

export function getGlobalPaymentsHomeHref(organizationId: string): AppHref {
  return {
    pathname: '/dashboard/payments',
    query: { organizationId },
  };
}

export function getGlobalPayoutHistoryHref(organizationId: string): AppHref {
  return {
    pathname: '/dashboard/payments/payouts',
    query: { organizationId },
  };
}

export function getEventOverviewHref(eventId: string): AppHref {
  return {
    pathname: '/dashboard/events/[eventId]',
    params: { eventId },
  };
}

export function getEventPaymentsHomeHref(eventId: string): AppHref {
  return {
    pathname: '/dashboard/events/[eventId]/payments',
    params: { eventId },
  };
}

export function getEventPayoutHistoryHref(eventId: string): AppHref {
  return {
    pathname: '/dashboard/events/[eventId]/payments/payouts',
    params: { eventId },
  };
}

export function getPayoutDetailHref(
  payoutRequestId: string,
  options?: { eventId?: string },
): AppHref {
  if (options?.eventId) {
    return {
      pathname: '/dashboard/events/[eventId]/payments/payouts/[payoutRequestId]',
      params: { eventId: options.eventId, payoutRequestId },
    };
  }

  return {
    pathname: '/dashboard/payments/payouts/[payoutRequestId]',
    params: { payoutRequestId },
  };
}
