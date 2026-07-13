import { ImportMappingPreview } from '@/components/results/organizer/import-mapping-preview';

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock('@/lib/events/results/actions', () => ({
  importResultDraftRows: jest.fn(async () => ({ ok: true, data: { importedRowCount: 0 } })),
}));
import {
  buildResultImportHeaderSignature,
  createEmptyResultImportFieldMapping,
} from '@/lib/events/results/ingestion/mapping-templates';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// jsdom's File/Blob has no `arrayBuffer()`/`text()`, so CSV parsing always
// falls back to FileReader, which resolves over two nested Node
// `setImmediate` macrotask hops (see jsdom's FileReader-impl.js). Under a
// CPU-saturated `pnpm test` run those hops can lag past the default 1000ms
// findBy timeout, so this suite gets a generous ceiling (see the matching
// `findByText(..., { timeout: ... })` calls below).
jest.setTimeout(15_000);

const storageKey = 'results.import.mapping.test';

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
  import: {
    sectionTitle: 'Import to draft',
    sectionDescription: 'Import mapped rows.',
    distanceLabel: 'Distance',
    distanceAllOption: 'No specific distance',
    submitAction: 'Import to draft',
    submitPending: 'Importing',
    blockedByIssues: 'Resolve blockers first.',
    successMessage: 'Imported.',
    failurePrefix: 'Import failed:',
  },
} as const;

function renderComponent() {
  return render(<ImportMappingPreview storageKey={storageKey} eventId="00000000-0000-0000-0000-000000000000" distances={[]} labels={labels} />);
}

describe('ImportMappingPreview', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('parses uploaded CSV files and renders sample-row preview', async () => {
    renderComponent();

    const csv = [
      'Name,Bib,Time,Status',
      'Ana Rivera,101,00:24:10,finish',
      'Luis Mena,102,00:27:55,dnf',
    ].join('\n');
    const file = new File([csv], 'results.csv', { type: 'text/csv' });

    fireEvent.change(screen.getByLabelText(labels.uploadLabel), {
      target: { files: [file] },
    });

    // Generous timeout: the FileReader macrotask hops above can lag past
    // the default 1000ms wait under saturated jest workers.
    expect(
      await screen.findByText('Parsed file summary', {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getAllByText('Ana Rivera').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Luis Mena').length).toBeGreaterThan(0);
  });

  it('applies a saved mapping template for similar files', async () => {
    const templateMapping = createEmptyResultImportFieldMapping();
    templateMapping.runnerFullName = 'Name';
    templateMapping.bibNumber = 'Bib';
    templateMapping.finishTimeMillis = 'Time';
    templateMapping.status = 'Status';

    window.localStorage.setItem(
      storageKey,
      JSON.stringify([
        {
          id: 'template-1',
          name: 'Default race export',
          headerSignature: buildResultImportHeaderSignature([
            'Name',
            'Bib',
            'Time',
            'Status',
          ]),
          mapping: templateMapping,
          createdAt: '2026-02-07T12:00:00.000Z',
          updatedAt: '2026-02-07T12:00:00.000Z',
        },
      ]),
    );

    renderComponent();

    const csv = [
      'Name,Bib,Time,Status',
      'Ana Rivera,101,00:24:10,finish',
    ].join('\n');
    const file = new File([csv], 'results.csv', { type: 'text/csv' });

    fireEvent.change(screen.getByLabelText(labels.uploadLabel), {
      target: { files: [file] },
    });

    // Generous timeout: the FileReader macrotask hops above can lag past
    // the default 1000ms wait under saturated jest workers.
    await screen.findByText('Parsed file summary', {}, { timeout: 10_000 });

    fireEvent.change(screen.getByLabelText(labels.savedTemplatesLabel), {
      target: { value: 'template-1' },
    });

    expect(
      screen.getByRole('combobox', { name: 'Map field Runner name' }),
    ).toHaveValue('Name');
    expect(
      screen.getByRole('combobox', { name: 'Map field Finish time' }),
    ).toHaveValue('Time');
  });

  it('allows manual override after applying a saved template', async () => {
    const templateMapping = createEmptyResultImportFieldMapping();
    templateMapping.runnerFullName = 'Name';
    templateMapping.finishTimeMillis = 'Time';

    window.localStorage.setItem(
      storageKey,
      JSON.stringify([
        {
          id: 'template-2',
          name: 'Template with runner name',
          headerSignature: buildResultImportHeaderSignature([
            'Name',
            'Athlete',
            'Time',
          ]),
          mapping: templateMapping,
          createdAt: '2026-02-07T12:00:00.000Z',
          updatedAt: '2026-02-07T12:00:00.000Z',
        },
      ]),
    );

    renderComponent();

    const csv = [
      'Name,Athlete,Time',
      'Ana Rivera,Ana R,00:24:10',
    ].join('\n');
    const file = new File([csv], 'results.csv', { type: 'text/csv' });

    fireEvent.change(screen.getByLabelText(labels.uploadLabel), {
      target: { files: [file] },
    });

    // Generous timeout: the FileReader macrotask hops above can lag past
    // the default 1000ms wait under saturated jest workers.
    await screen.findByText('Parsed file summary', {}, { timeout: 10_000 });

    fireEvent.change(screen.getByLabelText(labels.savedTemplatesLabel), {
      target: { value: 'template-2' },
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Map field Runner name' }), {
      target: { value: 'Athlete' },
    });

    await waitFor(() => {
      const preview = screen.getByTestId('results-import-mapping-preview-json');
      expect(preview).toHaveTextContent('"runnerFullName": "Athlete"');
    });
  });
});
