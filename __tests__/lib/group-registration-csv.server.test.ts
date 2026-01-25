import { generateGroupRegistrationTemplateCsv, parseCsv } from '@/lib/events/group-registrations/csv';

describe('group registration CSV utilities', () => {
  it('parses the template CSV', () => {
    const csv = generateGroupRegistrationTemplateCsv();
    const parsed = parseCsv(csv);

    expect(parsed.headers).toContain('firstName');
    expect(parsed.headers).toContain('email');
    expect(parsed.rows.length).toBe(1);
  });

  it('parses quoted fields containing commas', () => {
    const csv = 'firstName,lastName,email,dateOfBirth,distanceLabel\n"Ana, María",Perez,ana@example.com,1990-01-01,10K\n';
    const parsed = parseCsv(csv);

    expect(parsed.rows[0][0]).toBe('Ana, María');
  });

  it('handles escaped quotes inside quoted fields', () => {
    const csv = 'firstName,lastName\n"Ana ""María""",Perez\n';
    const parsed = parseCsv(csv);

    expect(parsed.rows[0][0]).toBe('Ana "María"');
  });

  it('supports multiline quoted fields', () => {
    const csv = 'name,notes\nAna,"line 1\nline 2"\n';
    const parsed = parseCsv(csv);

    expect(parsed.rows[0][1]).toBe('line 1\nline 2');
  });

  it('strips UTF-8 BOM from the first header cell', () => {
    const csv = '\uFEFFfirstName,lastName\nAna,Perez\n';
    const parsed = parseCsv(csv);

    expect(parsed.headers[0]).toBe('firstName');
  });

  it('throws on unclosed quotes', () => {
    const csv = 'firstName,lastName\n"Ana,Perez\n';
    expect(() => parseCsv(csv)).toThrow('CSV_PARSE_ERROR_UNCLOSED_QUOTE');
  });
});
