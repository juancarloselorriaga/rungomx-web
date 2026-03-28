import { extractDigits, formatDigitsAsTime } from './time-input';

describe('extractDigits', () => {
  it('strips non-digit characters', () => {
    expect(extractDigits('1:23:45')).toBe('12345');
    expect(extractDigits('abc123')).toBe('123');
    expect(extractDigits('')).toBe('');
  });

  it('caps at 6 digits', () => {
    expect(extractDigits('1234567890')).toBe('123456');
  });
});

describe('formatDigitsAsTime', () => {
  it('returns raw digits for 1-2 chars', () => {
    expect(formatDigitsAsTime('')).toBe('');
    expect(formatDigitsAsTime('1')).toBe('1');
    expect(formatDigitsAsTime('12')).toBe('12');
  });

  it('formats 3 digits as M:SS', () => {
    expect(formatDigitsAsTime('123')).toBe('1:23');
  });

  it('formats 4 digits as MM:SS', () => {
    expect(formatDigitsAsTime('1234')).toBe('12:34');
  });

  it('formats 5 digits as H:MM:SS', () => {
    expect(formatDigitsAsTime('12345')).toBe('1:23:45');
  });

  it('formats 6 digits as HH:MM:SS', () => {
    expect(formatDigitsAsTime('123456')).toBe('12:34:56');
  });
});
