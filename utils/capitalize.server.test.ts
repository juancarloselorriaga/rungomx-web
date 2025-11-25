import { capitalize } from './capitalize';

describe('capitalize', () => {
  it('capitalizes the first letter of a string', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('lowercases all other letters', () => {
    expect(capitalize('WORLD')).toBe('World');
    expect(capitalize('hELLO')).toBe('Hello');
  });

  it('handles empty strings', () => {
    expect(capitalize('')).toBe('');
  });

  it('handles single character strings', () => {
    expect(capitalize('a')).toBe('A');
    expect(capitalize('Z')).toBe('Z');
  });

  it('handles strings with mixed case', () => {
    expect(capitalize('jAvAsCrIpT')).toBe('Javascript');
  });
});
