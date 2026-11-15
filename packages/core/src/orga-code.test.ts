import { describe, expect, it } from 'vitest';
import {
  findAvailableOrgaCode,
  generateOrgaCode,
  normalizeOrgaCode,
  ORGA_CODE_ALPHABET,
  ORGA_CODE_LENGTH,
} from './orga-code.js';

describe('orga-code rules', () => {
  it('generates five unambiguous characters from an injected random source', () => {
    const code = generateOrgaCode((length) => new Uint8Array(length).fill(239));
    expect(code).toBe('ZZZZZ');
    expect(code).toHaveLength(ORGA_CODE_LENGTH);
    expect(
      [...code].every((character) => ORGA_CODE_ALPHABET.includes(character)),
    ).toBe(true);
    expect(ORGA_CODE_ALPHABET).not.toMatch(/[01OILU]/);
  });

  it('rejects out-of-range random bytes without bias', () => {
    let batch = 0;
    expect(
      generateOrgaCode(
        () =>
          new Uint8Array(batch++ === 0 ? [255, 0, 1, 2, 3] : [4, 5, 6, 7, 8]),
      ),
    ).toBe('23456');
  });

  it('normalizes case and whitespace without inventing ambiguous characters', () => {
    expect(normalizeOrgaCode(' ab 2 z ')).toBe('AB2Z');
  });

  it('retries collisions and stops after the configured bound', async () => {
    const candidates = ['AAAAA', 'AAAAA', 'BBBBB'];
    const code = await findAvailableOrgaCode(
      async (candidate) => candidate === 'AAAAA',
      () => candidates.shift()!,
      3,
    );
    expect(code).toBe('BBBBB');
    await expect(
      findAvailableOrgaCode(
        async () => true,
        () => 'AAAAA',
        2,
      ),
    ).rejects.toThrow(/after retries/);
  });
});
