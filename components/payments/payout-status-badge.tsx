'use client';

import { Badge } from '@/components/common/badge';

type PayoutStatusBadgeProps = {
  label: string;
  status: 'requested' | 'processing' | 'paused' | 'completed' | 'failed';
};

function badgeVariantForStatus(status: PayoutStatusBadgeProps['status']) {
  switch (status) {
    case 'completed':
      return 'green' as const;
    case 'failed':
      return 'indigo' as const;
    case 'paused':
      return 'outline' as const;
    case 'processing':
      return 'primary' as const;
    case 'requested':
    default:
      return 'default' as const;
  }
}

export function PayoutStatusBadge({ label, status }: PayoutStatusBadgeProps) {
  return <Badge variant={badgeVariantForStatus(status)}>{label}</Badge>;
}
