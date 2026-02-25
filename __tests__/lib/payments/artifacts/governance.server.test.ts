import {
  ArtifactGovernanceError,
  enforceArtifactResendRateLimit,
  normalizeArtifactGovernanceTraceScope,
  projectNextArtifactVersionLineage,
  resolveArtifactFingerprint,
} from '@/lib/payments/artifacts/governance';

describe('artifact governance policy helpers', () => {
  it('enforces singleton trace scope and rejects batch/date-range requests', () => {
    expect(normalizeArtifactGovernanceTraceScope({ traceId: ' trace-1 ' })).toBe('trace-1');

    expect(() =>
      normalizeArtifactGovernanceTraceScope({
        traceId: '',
      }),
    ).toThrow(ArtifactGovernanceError);

    expect(() =>
      normalizeArtifactGovernanceTraceScope({
        traceId: 'trace-1',
        scope: { traceIds: ['trace-2'] },
      }),
    ).toThrow(ArtifactGovernanceError);

    try {
      normalizeArtifactGovernanceTraceScope({
        traceId: 'trace-1',
        scope: { dateFrom: '2026-02-01' },
      });
      throw new Error('Expected singleton scope validation to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ArtifactGovernanceError);
      expect((error as ArtifactGovernanceError).code).toBe('ARTIFACT_SCOPE_SINGLETON_REQUIRED');
    }
  });

  it('builds immutable lineage metadata and keeps trace linkage deterministic', () => {
    const payloadWithFingerprint = {
      statementFingerprint: 'fp-explicit-123',
      accessReference: {
        href: '/api/payments/payouts/p1/statement',
      },
    };

    const firstLineage = projectNextArtifactVersionLineage({
      traceId: 'trace-linked-1',
      artifactType: 'payout_statement',
      payload: payloadWithFingerprint,
      latestVersion: null,
    });

    expect(firstLineage).toEqual({
      traceId: 'trace-linked-1',
      artifactType: 'payout_statement',
      artifactVersion: 1,
      fingerprint: 'fp-explicit-123',
      rebuiltFromVersionId: null,
    });

    const payloadWithoutFingerprintA = {
      nested: {
        z: 1,
        a: [3, 2, 1],
      },
      another: 'value',
    };
    const payloadWithoutFingerprintB = {
      another: 'value',
      nested: {
        a: [3, 2, 1],
        z: 1,
      },
    };

    const firstFallbackFingerprint = resolveArtifactFingerprint({
      artifactType: 'payout_statement',
      traceId: 'trace-linked-1',
      payload: payloadWithoutFingerprintA,
    });
    const secondFallbackFingerprint = resolveArtifactFingerprint({
      artifactType: 'payout_statement',
      traceId: 'trace-linked-1',
      payload: payloadWithoutFingerprintB,
    });

    expect(secondFallbackFingerprint).toBe(firstFallbackFingerprint);

    const rebuiltLineage = projectNextArtifactVersionLineage({
      traceId: 'trace-linked-1',
      artifactType: 'payout_statement',
      payload: payloadWithoutFingerprintA,
      latestVersion: {
        id: 'version-0001',
        artifactVersion: 1,
      },
    });

    expect(rebuiltLineage.traceId).toBe('trace-linked-1');
    expect(rebuiltLineage.artifactVersion).toBe(2);
    expect(rebuiltLineage.rebuiltFromVersionId).toBe('version-0001');
    expect(rebuiltLineage.fingerprint).toBe(firstFallbackFingerprint);
  });

  it('enforces resend rate limits with explicit denial codes', () => {
    const allowed = enforceArtifactResendRateLimit({
      traceId: 'trace-rl-1',
      rateLimit: {
        allowed: true,
        remaining: 3,
        resetAt: new Date('2026-02-26T10:00:00.000Z'),
      },
    });

    expect(allowed).toEqual({
      remaining: 3,
      resetAt: new Date('2026-02-26T10:00:00.000Z'),
    });

    try {
      enforceArtifactResendRateLimit({
        traceId: 'trace-rl-1',
        rateLimit: {
          allowed: false,
          remaining: 0,
          resetAt: new Date('2026-02-26T11:00:00.000Z'),
        },
      });
      throw new Error('Expected resend policy to deny request');
    } catch (error) {
      expect(error).toBeInstanceOf(ArtifactGovernanceError);
      const governanceError = error as ArtifactGovernanceError;
      expect(governanceError.code).toBe('ARTIFACT_RESEND_RATE_LIMITED');
      expect(governanceError.detail?.traceId).toBe('trace-rl-1');
      expect(governanceError.detail?.resetAt).toBe('2026-02-26T11:00:00.000Z');
    }
  });
});
