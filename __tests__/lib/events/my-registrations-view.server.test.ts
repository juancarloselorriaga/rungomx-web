import {
  DEFAULT_MY_REGISTRATIONS_VIEW,
  MY_REGISTRATIONS_VIEWS,
  parseMyRegistrationsView,
} from '@/lib/events/my-registrations/view';

describe('my registrations view parser', () => {
  it('exports the canonical views with upcoming as the default', () => {
    expect(MY_REGISTRATIONS_VIEWS).toEqual(['upcoming', 'in_progress', 'past', 'cancelled']);
    expect(DEFAULT_MY_REGISTRATIONS_VIEW).toBe('upcoming');
  });

  it('returns the matching view for valid inputs', () => {
    expect(parseMyRegistrationsView('upcoming')).toBe('upcoming');
    expect(parseMyRegistrationsView('past')).toBe('past');
    expect(parseMyRegistrationsView('cancelled')).toBe('cancelled');
    expect(parseMyRegistrationsView('in_progress')).toBe('in_progress');
  });

  it('uses the first value when search params provide an array', () => {
    expect(parseMyRegistrationsView(['past', 'upcoming'])).toBe('past');
  });

  it('falls back to the default view for unknown or missing values', () => {
    expect(parseMyRegistrationsView('other')).toBe(DEFAULT_MY_REGISTRATIONS_VIEW);
    expect(parseMyRegistrationsView(null)).toBe(DEFAULT_MY_REGISTRATIONS_VIEW);
    expect(parseMyRegistrationsView(undefined)).toBe(DEFAULT_MY_REGISTRATIONS_VIEW);
    expect(parseMyRegistrationsView([])).toBe(DEFAULT_MY_REGISTRATIONS_VIEW);
  });
});
