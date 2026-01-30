const DAY_MS = 24 * 60 * 60 * 1000;

type GrantDefinition = {
  grantDurationDays?: number | null;
  grantFixedEndsAt?: Date | null;
};

export type GrantWindowResult = {
  startsAt: Date;
  endsAt: Date;
  noExtension: boolean;
};

export function computeGrantWindow({
  now,
  currentProUntil,
  grantDurationDays,
  grantFixedEndsAt,
}: GrantDefinition & { now: Date; currentProUntil: Date | null }): GrantWindowResult {
  const startsAt = currentProUntil && currentProUntil > now ? currentProUntil : now;

  if (grantDurationDays !== undefined && grantDurationDays !== null) {
    const endsAt = new Date(startsAt.getTime() + grantDurationDays * DAY_MS);
    return { startsAt, endsAt, noExtension: endsAt <= startsAt };
  }

  if (grantFixedEndsAt) {
    const endsAt = grantFixedEndsAt > startsAt ? grantFixedEndsAt : startsAt;
    return { startsAt, endsAt, noExtension: endsAt <= startsAt };
  }

  return { startsAt, endsAt: startsAt, noExtension: true };
}
