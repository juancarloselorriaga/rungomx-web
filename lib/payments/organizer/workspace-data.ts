import type { AuthContext } from '@/lib/auth/server';
import { getOrgMembership } from '@/lib/organizations/permissions';
import type {
  OrganizerWalletIssuesApiResponse,
  OrganizerWalletSnapshotApiResponse,
} from '@/lib/payments/organizer/ui';
import { getOrganizerWalletIssueActivity } from '@/lib/payments/wallet/issue-activity';
import { getOrganizerWalletBucketSnapshot } from '@/lib/payments/wallet/snapshot';

export type OrganizerPaymentsWorkspaceData = {
  wallet: OrganizerWalletSnapshotApiResponse['data'] | null;
  issues: OrganizerWalletIssuesApiResponse['data'] | null;
};

export async function loadOrganizerPaymentsWorkspaceData(params: {
  authContext: AuthContext;
  organizationId: string;
}): Promise<OrganizerPaymentsWorkspaceData | null> {
  if (!params.authContext.user) {
    return null;
  }

  if (!params.authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(params.authContext.user.id, params.organizationId);
    if (!membership) {
      return null;
    }
  }

  const [walletResult, issuesResult] = await Promise.allSettled([
    getOrganizerWalletBucketSnapshot({
      organizerId: params.organizationId,
    }),
    getOrganizerWalletIssueActivity({
      organizerId: params.organizationId,
    }),
  ]);

  const wallet =
    walletResult.status === 'fulfilled'
      ? {
          organizerId: walletResult.value.organizerId,
          asOf: walletResult.value.asOf.toISOString(),
          buckets: walletResult.value.buckets,
          debt: walletResult.value.debt,
        }
      : null;
  const issues =
    issuesResult.status === 'fulfilled'
      ? {
          organizerId: issuesResult.value.organizerId,
          asOf: issuesResult.value.asOf.toISOString(),
          actionNeeded: issuesResult.value.actionNeeded.map((item) => ({
            ...item,
            occurredAt: item.occurredAt.toISOString(),
          })),
          inProgress: issuesResult.value.inProgress.map((item) => ({
            ...item,
            occurredAt: item.occurredAt.toISOString(),
          })),
        }
      : null;

  if (!wallet && !issues) {
    return null;
  }

  return { wallet, issues };
}
