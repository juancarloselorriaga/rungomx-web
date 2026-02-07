import {
  PUBLIC_RESULT_IDENTITY_POLICY_BASELINE,
  getPublicResultIdentityPolicy,
  resolvePublicResultIdentityDisplay,
} from '@/lib/events/results/public-identity-policy';

describe('public identity display policy', () => {
  it('uses baseline mode when no configuration override exists', () => {
    const policy = getPublicResultIdentityPolicy({ mode: null });

    expect(policy).toEqual(PUBLIC_RESULT_IDENTITY_POLICY_BASELINE);
  });

  it('returns full name + bib under baseline mode', () => {
    const identity = resolvePublicResultIdentityDisplay(
      {
        runnerFullName: 'Ana Runner',
        bibNumber: '101',
      },
      { mode: 'full_name_with_bib' },
    );

    expect(identity).toEqual({
      runnerLabel: 'Ana Runner',
      bibLabel: '101',
      policyMode: 'full_name_with_bib',
    });
  });

  it('returns initials + bib when policy mode is initials_with_bib', () => {
    const identity = resolvePublicResultIdentityDisplay(
      {
        runnerFullName: 'Ana Runner',
        bibNumber: '101',
      },
      { mode: 'initials_with_bib' },
    );

    expect(identity).toEqual({
      runnerLabel: 'A. R.',
      bibLabel: '101',
      policyMode: 'initials_with_bib',
    });
  });

  it('returns bib-only display without exposing full names', () => {
    const identity = resolvePublicResultIdentityDisplay(
      {
        runnerFullName: 'Ana Runner',
        bibNumber: '101',
      },
      { mode: 'bib_only' },
    );

    expect(identity).toEqual({
      runnerLabel: 'Runner',
      bibLabel: '101',
      policyMode: 'bib_only',
    });
  });

  it('falls back to baseline when an unknown mode is configured', () => {
    const policy = getPublicResultIdentityPolicy({ mode: 'unknown_mode' });
    const identity = resolvePublicResultIdentityDisplay(
      {
        runnerFullName: 'Ana Runner',
        bibNumber: '101',
      },
      policy,
    );

    expect(policy).toEqual(PUBLIC_RESULT_IDENTITY_POLICY_BASELINE);
    expect(identity).toEqual({
      runnerLabel: 'Ana Runner',
      bibLabel: '101',
      policyMode: 'full_name_with_bib',
    });
  });
});
