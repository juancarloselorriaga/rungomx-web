import { Badge } from '@/components/common/badge';
import { Link } from '@/i18n/navigation';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getPublicRankingLeaderboard } from '@/lib/events/results/rankings';

type RankingsPageProps = LocalePageProps & {
  searchParams: Promise<{
    discipline?: string;
    gender?: string;
    ageGroup?: string;
    scope?: string;
    organizationId?: string;
    snapshotId?: string;
  }>;
};

const DISCIPLINE_LABEL_KEYS = {
  trail_running: 'discipline.trail_running',
  triathlon: 'discipline.triathlon',
  cycling: 'discipline.cycling',
  mtb: 'discipline.mtb',
  gravel_bike: 'discipline.gravel_bike',
  duathlon: 'discipline.duathlon',
  backyard_ultra: 'discipline.backyard_ultra',
} as const;

const GENDER_LABEL_KEYS = {
  male: 'gender.male',
  female: 'gender.female',
  non_binary: 'gender.non_binary',
  other: 'gender.other',
} as const;

function resolveDisciplineLabelKey(value: string) {
  return DISCIPLINE_LABEL_KEYS[value as keyof typeof DISCIPLINE_LABEL_KEYS];
}

function resolveGenderLabelKey(value: string) {
  return GENDER_LABEL_KEYS[value as keyof typeof GENDER_LABEL_KEYS];
}

function formatFinishTime(milliseconds: number | null): string {
  if (milliseconds === null || milliseconds < 0) return '-';

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/rankings',
    (messages) => messages.Pages?.Results?.metadata,
  );
}

export default async function RankingsPage({ params, searchParams }: RankingsPageProps) {
  const { locale } = await params;
  await configPageLocale(params, { pathname: '/rankings' });
  const t = await getTranslations('pages.rankings');
  const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const filters = await searchParams;
  const leaderboard = await getPublicRankingLeaderboard({
    discipline: filters.discipline,
    gender: filters.gender,
    ageGroup: filters.ageGroup,
    scope: filters.scope,
    organizationId: filters.organizationId,
    snapshotId: filters.snapshotId,
  });

  const hasActiveFilters =
    leaderboard.filters.scope === 'organizer' ||
    leaderboard.filters.discipline ||
    leaderboard.filters.gender ||
    leaderboard.filters.ageGroup ||
    (leaderboard.snapshot ? !leaderboard.snapshot.isCurrent : false);

  const selectedSnapshotGeneratedAtLabel =
    leaderboard.snapshot !== null
      ? dateTimeFormatter.format(leaderboard.snapshot.generatedAt)
      : null;
  const selectedSnapshotPromotedAtLabel =
    leaderboard.snapshot?.promotedAt !== null && leaderboard.snapshot?.promotedAt !== undefined
      ? dateTimeFormatter.format(leaderboard.snapshot.promotedAt)
      : t('reproducibility.notAvailable');

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </header>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="indigo">
            {leaderboard.filters.scope === 'organizer'
              ? t('scope.organizer')
              : t('scope.national')}
          </Badge>
          {!hasActiveFilters ? <Badge variant="outline">{t('scope.default')}</Badge> : null}
        </div>

        {leaderboard.snapshot ? (
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p className="flex flex-wrap items-center gap-2">
              {t('snapshot.summary', {
                ruleset: leaderboard.snapshot.rulesetVersionTag,
                rows: leaderboard.snapshot.rowCount,
              })}
              <Badge variant="outline" size="sm">
                {leaderboard.snapshot.isCurrent
                  ? t('snapshot.current')
                  : t('snapshot.historical')}
              </Badge>
            </p>
            {leaderboard.snapshot.scope === 'organizer' && leaderboard.snapshot.organizationName ? (
              <p>
                {t('scope.contextOrg', {
                  organization: leaderboard.snapshot.organizationName,
                })}
              </p>
            ) : null}

            <details className="mt-2 rounded-md border bg-muted/30 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-foreground">
                {t('reproducibility.summary')}
              </summary>
              <dl className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                <div>
                  <dt className="font-medium text-foreground">
                    {t('reproducibility.fields.ruleset')}
                  </dt>
                  <dd>{leaderboard.snapshot.rulesetVersionTag}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">
                    {t('reproducibility.fields.generatedAt')}
                  </dt>
                  <dd>{selectedSnapshotGeneratedAtLabel}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">
                    {t('reproducibility.fields.promotedAt')}
                  </dt>
                  <dd>{selectedSnapshotPromotedAtLabel}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">
                    {t('reproducibility.fields.snapshotId')}
                  </dt>
                  <dd className="font-mono">{leaderboard.snapshot.id}</dd>
                </div>
              </dl>
              {leaderboard.snapshot.rulesetReference ? (
                <p className="mt-2">
                  <a
                    href={leaderboard.snapshot.rulesetReference}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {t('reproducibility.referenceLink')}
                  </a>
                </p>
              ) : (
                <p className="mt-2">{t('reproducibility.referenceMissing')}</p>
              )}
            </details>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">{t('empty.noSnapshot')}</p>
        )}

        <form className="mt-4 grid gap-3 md:grid-cols-6" method="get">
          <label className="grid gap-1 text-xs text-muted-foreground">
            <span>{t('filters.scope')}</span>
            <select
              name="scope"
              defaultValue={leaderboard.filters.scope}
              className="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
            >
              <option value="national">{t('scope.national')}</option>
              <option value="organizer">{t('scope.organizer')}</option>
            </select>
          </label>

          <label className="grid gap-1 text-xs text-muted-foreground">
            <span>{t('filters.organization')}</span>
            <select
              name="organizationId"
              defaultValue={leaderboard.filters.organizationId ?? ''}
              disabled={leaderboard.filters.scope !== 'organizer'}
              className="h-10 rounded-md border bg-background px-3 text-sm text-foreground disabled:opacity-50"
            >
              <option value="">{t('filters.all')}</option>
              {leaderboard.filters.availableOrganizers.map((organizer) => (
                <option key={organizer.organizationId} value={organizer.organizationId}>
                  {organizer.organizationName}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs text-muted-foreground">
            <span>{t('filters.discipline')}</span>
            <select
              name="discipline"
              defaultValue={leaderboard.filters.discipline ?? ''}
              className="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
            >
              <option value="">{t('filters.all')}</option>
              {leaderboard.filters.availableDisciplines.map((discipline) => {
                const disciplineLabelKey = resolveDisciplineLabelKey(discipline);
                return (
                  <option key={discipline} value={discipline}>
                    {disciplineLabelKey ? t(disciplineLabelKey) : discipline}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="grid gap-1 text-xs text-muted-foreground">
            <span>{t('filters.gender')}</span>
            <select
              name="gender"
              defaultValue={leaderboard.filters.gender ?? ''}
              className="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
            >
              <option value="">{t('filters.all')}</option>
              {leaderboard.filters.availableGenders.map((gender) => {
                const genderLabelKey = resolveGenderLabelKey(gender);
                return (
                  <option key={gender} value={gender}>
                    {genderLabelKey ? t(genderLabelKey) : gender}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="grid gap-1 text-xs text-muted-foreground">
            <span>{t('filters.ageGroup')}</span>
            <select
              name="ageGroup"
              defaultValue={leaderboard.filters.ageGroup ?? ''}
              className="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
            >
              <option value="">{t('filters.all')}</option>
              {leaderboard.filters.availableAgeGroups.map((ageGroup) => (
                <option key={ageGroup} value={ageGroup}>
                  {t('ageGroup.option', { ageGroup })}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs text-muted-foreground">
            <span>{t('filters.snapshot')}</span>
            <select
              name="snapshotId"
              defaultValue={leaderboard.filters.snapshotId ?? ''}
              disabled={leaderboard.filters.availableSnapshots.length === 0}
              className="h-10 rounded-md border bg-background px-3 text-sm text-foreground disabled:opacity-50"
            >
              <option value="">{t('filters.currentSnapshot')}</option>
              {leaderboard.filters.availableSnapshots.map((snapshotOption) => (
                <option key={snapshotOption.snapshotId} value={snapshotOption.snapshotId}>
                  {t('filters.snapshotOption', {
                    ruleset: snapshotOption.rulesetVersionTag,
                    generatedAt: dateTimeFormatter.format(snapshotOption.generatedAt),
                  })}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-end gap-2 md:col-span-6">
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              {t('filters.apply')}
            </button>
            <Link
              href="/rankings"
              className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium text-foreground"
            >
              {t('filters.reset')}
            </Link>
          </div>
        </form>
      </section>

      {leaderboard.state === 'empty' ? (
        <section className="rounded-xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
          {t('empty.noRows')}
        </section>
      ) : leaderboard.rows.length === 0 ? (
        <section className="rounded-xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
          {t('empty.noMatch')}
        </section>
      ) : (
        <section className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">{t('table.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('table.description')}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">{t('table.headers.rank')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('table.headers.runner')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('table.headers.bib')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('table.headers.discipline')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('table.headers.gender')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('table.headers.ageGroup')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('table.headers.finishTime')}</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.rows.map((row) => (
                  <tr key={`${row.rank}-${row.runnerFullName}-${row.bibNumber ?? 'nobib'}`} className="border-b last:border-b-0">
                    <td className="px-4 py-3 text-foreground">{row.rank}</td>
                    <td className="px-4 py-3 text-foreground">{row.runnerFullName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.bibNumber ?? '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(() => {
                        const disciplineLabelKey = resolveDisciplineLabelKey(row.discipline);
                        return disciplineLabelKey ? t(disciplineLabelKey) : row.discipline;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(() => {
                        if (!row.gender) return '-';
                        const genderLabelKey = resolveGenderLabelKey(row.gender);
                        return genderLabelKey ? t(genderLabelKey) : row.gender;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.ageGroup ? t('ageGroup.option', { ageGroup: row.ageGroup }) : '-'}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {formatFinishTime(row.finishTimeMillis)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
