import { Badge, Hero, Section, TextBlock } from '@/components/common';
import { publicSelectClassName } from '@/components/common/public-form-styles';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getPublicRankingLeaderboard } from '@/lib/events/results/rankings';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import { formatFinishTime } from '@/utils/format-finish-time';
import { createLocalizedPageMetadata } from '@/utils/seo';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

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

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  return createLocalizedPageMetadata(
    locale,
    '/rankings',
    (messages) => messages.Pages?.Rankings?.metadata,
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
    <div className="w-full">
      <Hero
        badgeVariant="green"
        title={t('title')}
        description={t('description')}
        variant="gradient-green"
        titleSize="xl"
        align="left"
      />

      <Section variant="muted" padding="md" size="lg">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-8">
          <div className="rounded-[1.5rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_72%,var(--background-surface)_28%)] p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="indigo">
                {leaderboard.filters.scope === 'organizer'
                  ? t('scope.organizer')
                  : t('scope.national')}
              </Badge>
              {!hasActiveFilters ? <Badge variant="outline">{t('scope.default')}</Badge> : null}
            </div>

            {leaderboard.snapshot ? (
              <>
                <h2 className="font-display mt-6 text-[clamp(1.6rem,2.7vw,2.2rem)] font-medium leading-[0.98] tracking-[-0.03em] text-foreground">
                  {leaderboard.snapshot.isCurrent
                    ? t('snapshot.current')
                    : t('snapshot.historical')}
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {t('snapshot.summary', {
                    ruleset: leaderboard.snapshot.rulesetVersionTag,
                    rows: leaderboard.snapshot.rowCount,
                  })}
                </p>
                {leaderboard.snapshot.scope === 'organizer' &&
                leaderboard.snapshot.organizationName ? (
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {t('scope.contextOrg', {
                      organization: leaderboard.snapshot.organizationName,
                    })}
                  </p>
                ) : null}

                <dl className="mt-6 grid gap-4 border-t border-border/70 pt-5 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/75">
                      {t('reproducibility.fields.ruleset')}
                    </dt>
                    <dd className="mt-1 leading-7">{leaderboard.snapshot.rulesetVersionTag}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/75">
                      {t('reproducibility.fields.generatedAt')}
                    </dt>
                    <dd className="mt-1 leading-7">{selectedSnapshotGeneratedAtLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/75">
                      {t('reproducibility.fields.promotedAt')}
                    </dt>
                    <dd className="mt-1 leading-7">{selectedSnapshotPromotedAtLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/75">
                      {t('reproducibility.fields.snapshotId')}
                    </dt>
                    <dd className="mt-1 font-mono text-[12px] leading-7 text-foreground/80">
                      {leaderboard.snapshot.id}
                    </dd>
                  </div>
                </dl>
                {leaderboard.snapshot.rulesetReference ? (
                  <p className="mt-5">
                    <a
                      href={leaderboard.snapshot.rulesetReference}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                    >
                      {t('reproducibility.referenceLink')}
                    </a>
                  </p>
                ) : (
                  <p className="mt-5 text-sm leading-7 text-muted-foreground">
                    {t('reproducibility.referenceMissing')}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-6 text-sm leading-7 text-muted-foreground">
                {t('empty.noSnapshot')}
              </p>
            )}
          </div>

          <form
            className="rounded-[1.5rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_78%,var(--background-surface)_22%)] p-5 md:p-6"
            method="get"
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="grid gap-1.5 text-xs text-muted-foreground">
                <span>{t('filters.scope')}</span>
                <select
                  name="scope"
                  defaultValue={leaderboard.filters.scope}
                  className={publicSelectClassName}
                >
                  <option value="national">{t('scope.national')}</option>
                  <option value="organizer">{t('scope.organizer')}</option>
                </select>
              </label>

              <label className="grid gap-1.5 text-xs text-muted-foreground">
                <span>{t('filters.organization')}</span>
                <select
                  name="organizationId"
                  defaultValue={leaderboard.filters.organizationId ?? ''}
                  disabled={leaderboard.filters.scope !== 'organizer'}
                  className={publicSelectClassName}
                >
                  <option value="">{t('filters.all')}</option>
                  {leaderboard.filters.availableOrganizers.map((organizer) => (
                    <option key={organizer.organizationId} value={organizer.organizationId}>
                      {organizer.organizationName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-xs text-muted-foreground">
                <span>{t('filters.discipline')}</span>
                <select
                  name="discipline"
                  defaultValue={leaderboard.filters.discipline ?? ''}
                  className={publicSelectClassName}
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

              <label className="grid gap-1.5 text-xs text-muted-foreground">
                <span>{t('filters.gender')}</span>
                <select
                  name="gender"
                  defaultValue={leaderboard.filters.gender ?? ''}
                  className={publicSelectClassName}
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

              <label className="grid gap-1.5 text-xs text-muted-foreground">
                <span>{t('filters.ageGroup')}</span>
                <select
                  name="ageGroup"
                  defaultValue={leaderboard.filters.ageGroup ?? ''}
                  className={publicSelectClassName}
                >
                  <option value="">{t('filters.all')}</option>
                  {leaderboard.filters.availableAgeGroups.map((ageGroup) => (
                    <option key={ageGroup} value={ageGroup}>
                      {t('ageGroup.option', { ageGroup })}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-xs text-muted-foreground">
                <span>{t('filters.snapshot')}</span>
                <select
                  name="snapshotId"
                  defaultValue={leaderboard.filters.snapshotId ?? ''}
                  disabled={leaderboard.filters.availableSnapshots.length === 0}
                  className={publicSelectClassName}
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
            </div>

            <div className="mt-6 flex flex-wrap gap-2 border-t border-border/70 pt-5">
              <Button type="submit" className="min-w-0">
                {t('filters.apply')}
              </Button>
              <Button asChild variant="outline" className="min-w-0">
                <Link href="/rankings">{t('filters.reset')}</Link>
              </Button>
            </div>
          </form>
        </div>
      </Section>

      <Section padding="lg" size="lg">
        <TextBlock
          title={t('table.title')}
          description={t('table.description')}
          size="md"
          className="max-w-[46rem]"
        />

        {leaderboard.state === 'empty' ? (
          <div className="mt-12 rounded-[1.5rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_78%,var(--background-surface)_22%)] p-8 text-sm text-muted-foreground">
            {t('empty.noRows')}
          </div>
        ) : leaderboard.rows.length === 0 ? (
          <div className="mt-12 rounded-[1.5rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_78%,var(--background-surface)_22%)] p-8 text-sm text-muted-foreground">
            {t('empty.noMatch')}
          </div>
        ) : (
          <div className="mt-12 overflow-x-auto rounded-[1.5rem] border border-border/45 bg-[color-mix(in_oklch,var(--background)_82%,var(--background-surface)_18%)]">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-[0.72rem] uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">{t('table.headers.rank')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.headers.runner')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.headers.bib')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.headers.discipline')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.headers.gender')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.headers.ageGroup')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.headers.finishTime')}</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.rows.map((row) => (
                  <tr
                    key={`${row.rank}-${row.runnerFullName}-${row.bibNumber ?? 'nobib'}`}
                    className="border-b border-border/60 last:border-b-0"
                  >
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
        )}
      </Section>
    </div>
  );
}
