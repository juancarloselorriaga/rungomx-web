import { ImportMappingPreview } from '@/components/results/organizer/import-mapping-preview';
import { OrganizerResultsLane } from '@/components/results/organizer/organizer-results-lane';
import { LocalePageProps } from '@/types/next';
import { configPageLocale } from '@/utils/config-page-locale';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ResultsPageHero } from '../_results-page-hero';
import { getResultsWorkspacePageData } from '../_results-workspace';

type ResultsImportPageProps = LocalePageProps & {
  params: Promise<{ locale: string; eventId: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Results import | RunGoMX',
    robots: { index: false, follow: false },
  };
}

export default async function ResultsImportPage({ params }: ResultsImportPageProps) {
  const { locale, eventId } = await params;
  await configPageLocale(params, { pathname: '/dashboard/events/[eventId]/results/import' });
  const t = await getTranslations('pages.dashboardEvents.resultsWorkspace');
  const importEyebrow = t('lanes.import.eyebrow' as never);
  const pageData = await getResultsWorkspacePageData(eventId, locale, 'import');

  return (
    <div className="space-y-6">
      <ResultsPageHero
        eyebrow={importEyebrow}
        title={t('lanes.import.title')}
        description={t('lanes.import.description')}
        stats={[
          {
            label: t('importMapping.columnsLabel'),
            value: String(pageData.rows.length),
          },
          {
            label: t('stateRail.lifecycle'),
            value:
              pageData.railState.lifecycle === 'official'
                ? t('stateRail.lifecycleOfficial')
                : t('stateRail.lifecycleDraft'),
          },
          {
            label: t('stateRail.unsyncedCount'),
            value: String(pageData.railState.unsyncedCount),
          },
        ]}
      />

      <ImportMappingPreview
        storageKey={`results.import.mapping.${pageData.userScopeKey}.${eventId}`}
        labels={{
          title: t('importMapping.title'),
          description: t('importMapping.description'),
          uploadLabel: t('importMapping.uploadLabel'),
          uploadHint: t('importMapping.uploadHint'),
          parseSummary: t('importMapping.parseSummary'),
          columnsLabel: t('importMapping.columnsLabel'),
          sampleRowsLabel: t('importMapping.sampleRowsLabel'),
          totalRowsLabel: t('importMapping.totalRowsLabel'),
          savedTemplatesLabel: t('importMapping.savedTemplatesLabel'),
          savedTemplatesEmpty: t('importMapping.savedTemplatesEmpty'),
          saveTemplateNameLabel: t('importMapping.saveTemplateNameLabel'),
          saveTemplateNamePlaceholder: t('importMapping.saveTemplateNamePlaceholder'),
          saveTemplateAction: t('importMapping.saveTemplateAction'),
          templateAppliedMessage: t('importMapping.templateAppliedMessage'),
          templateSavedMessage: t('importMapping.templateSavedMessage'),
          requiredMappingMessage: t('importMapping.requiredMappingMessage'),
          parsingMessage: t('importMapping.parsingMessage'),
          mapFieldLabel: t('importMapping.mapFieldLabel'),
          unmappedOption: t('importMapping.unmappedOption'),
          requiredTag: t('importMapping.requiredTag'),
          optionalTag: t('importMapping.optionalTag'),
          mappingTableFieldLabel: t('importMapping.mappingTableFieldLabel'),
          mappingTableSourceLabel: t('importMapping.mappingTableSourceLabel'),
          mappingPreviewTitle: t('importMapping.mappingPreviewTitle'),
          mappingPreviewDescription: t('importMapping.mappingPreviewDescription'),
          samplePreviewTitle: t('importMapping.samplePreviewTitle'),
          samplePreviewDescription: t('importMapping.samplePreviewDescription'),
          validationTitle: t('importMapping.validationTitle'),
          validationDescription: t('importMapping.validationDescription'),
          blockersLabel: t('importMapping.blockersLabel'),
          warningsLabel: t('importMapping.warningsLabel'),
          issuesTableSeverityLabel: t('importMapping.issuesTableSeverityLabel'),
          issuesTableRowLabel: t('importMapping.issuesTableRowLabel'),
          issuesTableFieldLabel: t('importMapping.issuesTableFieldLabel'),
          issuesTableSourceLabel: t('importMapping.issuesTableSourceLabel'),
          issuesTableIssueLabel: t('importMapping.issuesTableIssueLabel'),
          issuesTableGuidanceLabel: t('importMapping.issuesTableGuidanceLabel'),
          derivedPreviewTitle: t('importMapping.derivedPreviewTitle'),
          derivedPreviewDescription: t('importMapping.derivedPreviewDescription'),
          derivedPreviewBlocked: t('importMapping.derivedPreviewBlocked'),
          derivedPreviewEmpty: t('importMapping.derivedPreviewEmpty'),
          derivedPreviewHeaders: {
            runner: t('importMapping.derivedPreviewHeaders.runner'),
            bib: t('importMapping.derivedPreviewHeaders.bib'),
            status: t('importMapping.derivedPreviewHeaders.status'),
            finishTime: t('importMapping.derivedPreviewHeaders.finishTime'),
            derivedOverall: t('importMapping.derivedPreviewHeaders.derivedOverall'),
          },
          parseErrors: {
            unsupported_format: t('importMapping.parseErrors.unsupportedFormat'),
            file_too_large: t('importMapping.parseErrors.fileTooLarge'),
            empty_file: t('importMapping.parseErrors.emptyFile'),
            missing_headers: t('importMapping.parseErrors.missingHeaders'),
            duplicate_headers: t('importMapping.parseErrors.duplicateHeaders'),
            malformed_file: t('importMapping.parseErrors.malformedFile'),
          },
          canonicalFieldLabels: {
            runnerFullName: t('importMapping.canonicalFields.runnerFullName'),
            bibNumber: t('importMapping.canonicalFields.bibNumber'),
            finishTimeMillis: t('importMapping.canonicalFields.finishTimeMillis'),
            status: t('importMapping.canonicalFields.status'),
            gender: t('importMapping.canonicalFields.gender'),
            age: t('importMapping.canonicalFields.age'),
            overallPlace: t('importMapping.canonicalFields.overallPlace'),
            genderPlace: t('importMapping.canonicalFields.genderPlace'),
            ageGroupPlace: t('importMapping.canonicalFields.ageGroupPlace'),
            distanceLabel: t('importMapping.canonicalFields.distanceLabel'),
          },
        }}
      />

      <OrganizerResultsLane
        eventId={eventId}
        densityStorageKey={pageData.densityStorageKey}
        railState={pageData.railState}
        nextActionHref={pageData.nextActionHref}
        versionVisibility={pageData.versionVisibility}
        rows={pageData.rows}
        feedbackItems={pageData.feedbackItems}
        labels={pageData.labels}
      />
    </div>
  );
}
