import { EntryResponse } from '@nennbox/contracts';
import { adminFetch } from '../../auth.js';

export async function fetchAdminEntry(id: string) {
  const response = await adminFetch(
    `/admin/entries/${encodeURIComponent(id)}`,
    { credentials: 'same-origin', cache: 'no-store' },
  );
  if (!response.ok) throw new Error('entry unavailable');
  return EntryResponse.parse(await response.json());
}
