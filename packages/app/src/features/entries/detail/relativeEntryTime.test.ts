import { afterEach, describe, expect, it, vi } from 'vitest';
import { relativeEntryTime } from './relativeEntryTime.js';

const now = Date.parse('2026-11-22T12:00:00.000Z');
afterEach(() => vi.useRealTimers());

describe('relativeEntryTime', () => {
  it.each([
    [0, 'gerade eben'],
    [59_999, 'gerade eben'],
    [60_000, 'vor 1 Min.'],
    [3_599_999, 'vor 59 Min.'],
    [3_600_000, 'vor 1 Std.'],
    [7_199_999, 'vor 1 Std.'],
    [86_399_999, 'vor 23 Std.'],
    [86_400_000, '21. Nov.'],
  ])('formats an age of %i milliseconds as %s', (age, expected) => {
    expect(relativeEntryTime(new Date(now - age).toISOString(), now)).toBe(
      expected,
    );
  });

  it('uses the current clock when no reference time is passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(relativeEntryTime('2026-11-22T11:55:00.000Z')).toBe('vor 5 Min.');
  });

  it('formats old and future timestamps as Berlin calendar dates', () => {
    expect(relativeEntryTime('2026-01-01T23:30:00Z', now)).toBe('2. Jan.');
    expect(relativeEntryTime('2026-07-01T22:30:00Z', now)).toBe('2. Juli');
    expect(relativeEntryTime('2026-11-22T23:30:00Z', now)).toBe('23. Nov.');
  });
});
