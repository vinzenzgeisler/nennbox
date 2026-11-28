import { describe, expect, it } from 'vitest';
import {
  assertParticipantMemoryRetention,
  defaultParticipantMemoryRetention,
  effectiveParticipantMemoryRetentionDays,
  participantMemoryConsentTerms,
} from './participant-memory.js';

describe('participant memory retention', () => {
  const bounds = defaultParticipantMemoryRetention;
  it('uses the default and clamps the organization choice into the bounds', () => {
    expect(effectiveParticipantMemoryRetentionDays(null, bounds)).toBe(365);
    expect(effectiveParticipantMemoryRetentionDays(undefined, bounds)).toBe(
      365,
    );
    expect(effectiveParticipantMemoryRetentionDays(90, bounds)).toBe(90);
    // Bounds tightened after a value was stored: the stricter limit wins.
    expect(effectiveParticipantMemoryRetentionDays(2000, bounds)).toBe(1095);
    expect(effectiveParticipantMemoryRetentionDays(1, bounds)).toBe(30);
  });
  it('rejects inconsistent bounds', () => {
    expect(() =>
      assertParticipantMemoryRetention({
        minimumDays: 10,
        defaultDays: 5,
        maximumDays: 20,
      }),
    ).toThrow();
    expect(() =>
      assertParticipantMemoryRetention({
        minimumDays: 1,
        defaultDays: 5,
        maximumDays: 4,
      }),
    ).toThrow();
    expect(() =>
      assertParticipantMemoryRetention({
        minimumDays: 0,
        defaultDays: 5,
        maximumDays: 9,
      }),
    ).toThrow();
    expect(assertParticipantMemoryRetention(bounds)).toBe(bounds);
  });
  it('carries a versioned wording in both languages', () => {
    expect(participantMemoryConsentTerms.version).toMatch(
      /^\d{4}-\d{2}-\d{2}\.\d+$/,
    );
    expect(participantMemoryConsentTerms.text.de.length).toBeGreaterThan(50);
    expect(participantMemoryConsentTerms.text.en.length).toBeGreaterThan(50);
  });
});
