import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import { groupDiscountRules, registrationGroupMembers, users } from '@/db/schema';

type DbLike = Pick<typeof db, 'select' | 'query'>;

export async function resolveGroupDiscount(params: {
  groupId: string;
  editionId: string;
  now?: Date;
  tx?: DbLike;
}) {
  const executor = params.tx ?? db;

  const [{ count: joinedMemberCount } = { count: 0 }] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(registrationGroupMembers)
    .innerJoin(users, eq(registrationGroupMembers.userId, users.id))
    .where(
      and(
        eq(registrationGroupMembers.groupId, params.groupId),
        isNull(registrationGroupMembers.leftAt),
        isNull(users.deletedAt),
        eq(users.emailVerified, true),
      ),
    );

  const rules = await executor.query.groupDiscountRules.findMany({
    where: and(
      eq(groupDiscountRules.editionId, params.editionId),
      eq(groupDiscountRules.isActive, true),
    ),
    orderBy: (rule, { desc }) => [desc(rule.minParticipants)],
  });

  const applicableRule =
    rules.find((rule) => joinedMemberCount >= rule.minParticipants) ?? null;

  if (!applicableRule) {
    return null;
  }

  return {
    percentOff: applicableRule.percentOff,
    ruleId: applicableRule.id,
    joinedMemberCount,
  };
}
