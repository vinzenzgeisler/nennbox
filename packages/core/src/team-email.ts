import { ProviderError } from './providers.js';

/** SMTPUTF8 local parts are unsupported; domain names use WHATWG URL's IDNA. */
export function normalizeTeamEmail(input: string): string {
  const email = input.trim().toLowerCase();
  const parts = email.split('@');
  const local = parts[0] ?? '';
  const domain = parts[1] ?? '';
  if ([...input.trim().split('@')[0]!].some((char) => char.charCodeAt(0) > 127))
    throw new ProviderError(
      'invalid_input',
      'Unicode in the email local part is not supported. Use an ASCII local part.',
    );
  const invalid = () =>
    new ProviderError('invalid_input', 'Invalid email address.');
  if (
    parts.length !== 2 ||
    local.length > 64 ||
    !/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(
      local,
    ) ||
    !domain ||
    /[\s@/:?#%\\]/.test(domain)
  )
    throw invalid();
  let ascii: string;
  try {
    ascii = new URL(`http://${domain}`).hostname;
  } catch {
    throw invalid();
  }
  if (
    ascii.length > 253 ||
    !ascii.includes('.') ||
    !ascii
      .split('.')
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    throw invalid();
  const normalized = `${local}@${ascii}`;
  if (normalized.length > 320) throw invalid();
  return normalized;
}
