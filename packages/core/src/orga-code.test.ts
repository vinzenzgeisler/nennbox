import { describe, expect, it } from 'vitest';
import {
  findAvailableOrgaCode,
  generateOrgaCode,
  normalizeOrgaCode,
  ORGA_CODE_ALPHABET,
  ORGA_CODE_LENGTH,
} from './orga-code.js';

describe('orga-code rules', () => {
  it('generates five Crockford Base32 characters from an injected random source', () => {
    const code = generateOrgaCode((length) => new Uint8Array(length).fill(255));
    expect(code).toBe('ZZZZZ');
    expect(code).toHaveLength(ORGA_CODE_LENGTH);
    expect(
      [...code].every((character) => ORGA_CODE_ALPHABET.includes(character)),
    ).toBe(true);
    expect(ORGA_CODE_ALPHABET).not.toMatch(/[OILU]/);
  });

  it('normalizes case, whitespace, and lookalike characters', () => {
    expect(normalizeOrgaCode(' ab o i l ')).toBe('AB011');
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
