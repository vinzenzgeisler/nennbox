/** Crockford Base32: 0/O and 1/I/L look alike, and U is omitted. */
export const ORGA_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ORGA_CODE_LENGTH = 5;

export type OrgaCodeRandomSource = (length: number) => Uint8Array;

/** Pure formatter from uniformly random bytes; callers supply a CSPRNG. */
export function generateOrgaCode(randomBytes: OrgaCodeRandomSource): string {
  const bytes = randomBytes(ORGA_CODE_LENGTH);
  if (bytes.length !== ORGA_CODE_LENGTH)
    throw new RangeError('Orga-code random source returned an invalid length');
  return [...bytes].map((byte) => ORGA_CODE_ALPHABET[byte & 31]!).join('');
}

/** Normalize human-entered codes, including common visual aliases. */
export function normalizeOrgaCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[O]/g, '0')
    .replace(/[IL]/g, '1');
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
