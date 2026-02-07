import { ImportMappingPreview } from '@/components/results/organizer/import-mapping-preview';
import { fireEvent, render, screen, within } from '@testing-library/react';

const storageKey = 'results.import.mapping.validation.test';

const labels = {
  title: 'CSV mapping preview',
  description: 'Map source columns to canonical fields.',
  uploadLabel: 'Upload CSV/Excel file',
  uploadHint: 'Use csv/xls/xlsx files.',
  parseSummary: 'Parsed file summary',
  columnsLabel: 'Columns',
  sampleRowsLabel: 'Sample rows',
  totalRowsLabel: 'Total rows',
  savedTemplatesLabel: 'Saved mapping templates',
  savedTemplatesEmpty: 'Select a saved template',
  saveTemplateNameLabel: 'Template name',
  saveTemplateNamePlaceholder: 'My mapping',
  saveTemplateAction: 'Save template',
  templateAppliedMessage: 'Template applied',
  templateSavedMessage: 'Template saved',
  requiredMappingMessage: 'Map required fields first',
  parsingMessage: 'Parsing...',
  mapFieldLabel: 'Map field',
  unmappedOption: 'Not mapped',
  requiredTag: 'required',
  optionalTag: 'optional',
  mappingTableFieldLabel: 'Canonical field',
  mappingTableSourceLabel: 'Source column',
  mappingPreviewTitle: 'Deterministic mapping payload',
  mappingPreviewDescription: 'Preview',
  samplePreviewTitle: 'Sample row preview',
  samplePreviewDescription: 'Rows',
  validationTitle: 'Validation report',
  validationDescription: 'Validation details',
  blockersLabel: 'Blockers',
  warningsLabel: 'Warnings',
  issuesTableSeverityLabel: 'Severity',
  issuesTableRowLabel: 'Row',
  issuesTableFieldLabel: 'Field',
  issuesTableSourceLabel: 'Source column',
  issuesTableIssueLabel: 'Issue',
  issuesTableGuidanceLabel: 'Fix guidance',
  derivedPreviewTitle: 'Draft preview with derived placement',
  derivedPreviewDescription: 'Derived preview',
  derivedPreviewBlocked: 'Resolve blockers to unlock draft preview.',
  derivedPreviewEmpty: 'No preview rows',
  derivedPreviewHeaders: {
    runner: 'Runner',
    bib: 'Bib',
    status: 'Status',
    finishTime: 'Finish time',
    derivedOverall: 'Derived overall place',
  },
  parseErrors: {
    unsupported_format: 'Unsupported format',
    file_too_large: 'Too large',
    empty_file: 'Empty file',
    missing_headers: 'Missing headers',
    duplicate_headers: 'Duplicate headers',
    malformed_file: 'Malformed file',
  },
  canonicalFieldLabels: {
    runnerFullName: 'Runner name',
    bibNumber: 'Bib number',
    finishTimeMillis: 'Finish time',
    status: 'Result status',
    gender: 'Gender',
    age: 'Age',
    overallPlace: 'Overall place',
    genderPlace: 'Gender place',
    ageGroupPlace: 'Age-group place',
    distanceLabel: 'Distance label',
  },
} as const;

function renderComponent() {
  return render(<ImportMappingPreview storageKey={storageKey} labels={labels} />);
}

describe('ImportMappingPreview validation and derived preview', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('separates blockers and warnings with row-level context and gates preview', async () => {
    renderComponent();

    const csv = [
      'Name,Bib,Time,Status',
      'Ana Rivera,101,00:24:10,finish',
      ',102,00:25:00,finish',
      'Leo Mora,101,not-a-time,finish',
      'Mia Cruz,103,00:28:00,unknown',
    ].join('\n');
    const file = new File([csv], 'validation.csv', { type: 'text/csv' });

    fireEvent.change(screen.getByLabelText(labels.uploadLabel), {
      target: { files: [file] },
    });

    expect(await screen.findByText(labels.validationTitle)).toBeInTheDocument();
    expect(screen.getByText('Runner name is missing.')).toBeInTheDocument();
    expect(
      screen.getByText('Finish time "not-a-time" is invalid for a finish status row.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Unknown status "unknown".')).toBeInTheDocument();
    expect(
      screen.getByText('Duplicate bib "101" also appears on row 2.'),
    ).toBeInTheDocument();
    expect(screen.getByText(labels.derivedPreviewBlocked)).toBeInTheDocument();
  });

  it('shows derived placement preview when blockers are resolved', async () => {
    renderComponent();

    const csv = [
      'Name,Bib,Time,Status',
      'Ana Rivera,101,00:24:10,finish',
      'Luis Mena,102,00:27:00,finish',
      'Sara Cruz,103,00:25:00,finish',
      'Mario DNF,104,,dnf',
    ].join('\n');
    const file = new File([csv], 'preview.csv', { type: 'text/csv' });

    fireEvent.change(screen.getByLabelText(labels.uploadLabel), {
      target: { files: [file] },
    });

    expect(await screen.findByText(labels.derivedPreviewTitle)).toBeInTheDocument();
    expect(screen.queryByText(labels.derivedPreviewBlocked)).not.toBeInTheDocument();

    const derivedHeading = screen.getByText(labels.derivedPreviewTitle);
    const derivedSection = derivedHeading.closest('section');
    if (!derivedSection) {
      throw new Error('Derived preview section was not rendered.');
    }

    const derivedSectionQueries = within(derivedSection);
    const anaRow = derivedSectionQueries.getByText('Ana Rivera').closest('tr');
    const saraRow = derivedSectionQueries.getByText('Sara Cruz').closest('tr');
    const luisRow = derivedSectionQueries.getByText('Luis Mena').closest('tr');
    const dnfRow = derivedSectionQueries.getByText('Mario DNF').closest('tr');

    if (!anaRow || !saraRow || !luisRow || !dnfRow) {
      throw new Error('Expected preview rows were not rendered.');
    }

    expect(within(anaRow).getAllByRole('cell').at(-1)).toHaveTextContent('1');
    expect(within(saraRow).getAllByRole('cell').at(-1)).toHaveTextContent('2');
    expect(within(luisRow).getAllByRole('cell').at(-1)).toHaveTextContent('3');
    expect(within(dnfRow).getAllByRole('cell').at(-1)).toHaveTextContent('-');
  });
});
