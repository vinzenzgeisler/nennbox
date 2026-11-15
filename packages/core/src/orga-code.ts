/** Unambiguous Crockford-style alphabet: omit 0/O, 1/I/L and U. */
export const ORGA_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ORGA_CODE_LENGTH = 5;

export type OrgaCodeRandomSource = (length: number) => Uint8Array;

/** Pure formatter from uniformly random bytes; callers supply a CSPRNG. */
export function generateOrgaCode(randomBytes: OrgaCodeRandomSource): string {
  const limit =
    Math.floor(256 / ORGA_CODE_ALPHABET.length) * ORGA_CODE_ALPHABET.length;
  let code = '';
  // Rejection sampling avoids modulo bias for the 30-symbol alphabet.
  for (
    let batch = 0;
    batch < 10 && code.length < ORGA_CODE_LENGTH;
    batch += 1
  ) {
    const bytes = randomBytes(ORGA_CODE_LENGTH);
    if (bytes.length !== ORGA_CODE_LENGTH)
      throw new RangeError(
        'Orga-code random source returned an invalid length',
      );
    for (const byte of bytes) {
      if (byte < limit)
        code += ORGA_CODE_ALPHABET[byte % ORGA_CODE_ALPHABET.length]!;
      if (code.length === ORGA_CODE_LENGTH) break;
    }
  }
  if (code.length !== ORGA_CODE_LENGTH)
    throw new Error(
      'Orga-code random source did not yield enough usable bytes',
    );
  return code;
}

/** Normalize human-entered codes; ambiguous glyphs are never generated. */
export function normalizeOrgaCode(input: string): string {
  return input.toUpperCase().replace(/\s+/g, '');
}

/** Run a bounded collision retry loop with injected candidate and existence ports. */
export async function findAvailableOrgaCode(
  isTaken: (code: string) => Promise<boolean>,
  generate: () => string,
  maxAttempts = 10,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generate();
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error('Unable to allocate a unique orga code after retries');
}
