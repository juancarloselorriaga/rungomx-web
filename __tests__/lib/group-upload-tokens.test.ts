import { generateToken, getTokenPrefix, hashToken } from '@/lib/events/group-upload/tokens';

describe('group upload token helpers', () => {
  it('hashToken is deterministic and hides raw token', () => {
    const token = 'sample-token-123';
    const hashA = hashToken(token);
    const hashB = hashToken(token);

    expect(hashA).toBe(hashB);
    expect(hashA).not.toContain(token);
    expect(hashA).toHaveLength(64);
  });

  it('getTokenPrefix returns a stable prefix', () => {
    const token = generateToken(16);
    const prefix = getTokenPrefix(token, 8);

    expect(prefix).toBe(token.slice(0, 8));
  });
});
