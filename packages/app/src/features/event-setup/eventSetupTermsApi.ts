import { z } from 'zod';
import { request, type SetupConsent } from './eventSetupApi.js';
const SetupConsentSchema = z.object({
  key: z.string(),
  version: z.string(),
  language: z.enum(['de', 'en']),
  text: z.string(),
  hash: z.string(),
  required: z.boolean(),
});
export const loadTerms = (eventId: string, signal?: AbortSignal) =>
  request<{ terms?: SetupConsent[] }>(
    `/admin/events/${encodeURIComponent(eventId)}/consents`,
    z
      .object({ terms: z.array(SetupConsentSchema).optional() })
      .transform(({ terms }) => ({ terms: terms ?? [] })),
    signal ? { signal } : undefined,
  );
export const saveTerms = async (
  eventId: string,
  terms: string,
  existing: SetupConsent[],
) => {
  const text = terms.trim();
  const current = existing.find(
    (term) => term.key === 'participation' && term.language === 'de',
  );
  if (current?.text === text || (!current && !text)) return;
  const hash = [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
    ),
  ]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return request(
    `/admin/events/${encodeURIComponent(eventId)}/consents`,
    z.object({ terms: z.array(SetupConsentSchema) }),
    {
      method: 'PUT',
      body: JSON.stringify({
        terms: [
          ...existing.filter(
            (term) => !(term.key === 'participation' && term.language === 'de'),
          ),
          ...(text
            ? [
                {
                  key: 'participation',
                  version: nextTermVersion(current?.version),
                  language: 'de',
                  text,
                  hash,
                  required: current?.required ?? true,
                },
              ]
            : []),
        ],
      }),
    },
  );
};
function nextTermVersion(version: string | undefined): string {
  if (!version) return '1';
  const match = /^(.*?)(\d+)$/.exec(version);
  return match ? `${match[1]}${Number(match[2]) + 1}` : `${version}.1`;
}
