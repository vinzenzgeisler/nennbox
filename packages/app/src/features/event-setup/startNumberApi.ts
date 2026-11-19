import { adminFetch } from '../../auth.js';

export type Mode = 'driver_choice' | 'organizer_assigned' | 'automatic';
export type Range = {
  id?: string;
  classId: string | null;
  from: string;
  to: string;
  reserved: string;
  mode: Mode;
};
export type Settings = {
  automaticPromotion: boolean;
  confirmationHours: number;
};
export type ClassOption = {
  id: string;
  name: string;
  maxParticipants: number | null;
};
type Config = {
  ranges: Array<{
    id: string;
    classId: string | null;
    from: number;
    to: number;
    reserved: number[];
    mode: Mode;
  }>;
  settings: Settings;
};

const eventUrl = (eventId: string) =>
  `/admin/events/${encodeURIComponent(eventId)}`;

export const emptyRange = (): Range => ({
  classId: null,
  from: '1',
  to: '50',
  reserved: '',
  mode: 'driver_choice',
});

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error();
  return (await response.json()) as T;
}

export async function loadStartNumberSetup(
  eventId: string,
  signal: AbortSignal,
): Promise<{ ranges: Range[]; settings: Settings; classes: ClassOption[] }> {
  const [config, classes] = await Promise.all([
    adminFetch(`${eventUrl(eventId)}/start-numbers`, { signal }).then(
      json<Config>,
    ),
    adminFetch(`${eventUrl(eventId)}/classes`, { signal }).then(
      json<ClassOption[]>,
    ),
  ]);
  return {
    ranges: config.ranges.map((range) => ({
      ...range,
      from: String(range.from),
      to: String(range.to),
      reserved: range.reserved.join(', '),
    })),
    settings: config.settings,
    classes,
  };
}

export async function saveStartNumberSetup(
  eventId: string,
  ranges: Range[],
  settings: Settings,
  classes: ClassOption[],
): Promise<void> {
  const response = await adminFetch(`${eventUrl(eventId)}/start-numbers`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ranges: ranges.map(({ classId, from, to, reserved, mode }) => ({
        classId,
        from: Number(from),
        to: Number(to),
        reserved: reserved
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
          .map(Number),
        mode,
      })),
      settings,
    }),
  });
  if (!response.ok) throw new Error();
  const capacities = await Promise.all(
    classes.map((eventClass) =>
      adminFetch(
        `${eventUrl(eventId)}/classes/${encodeURIComponent(eventClass.id)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ maxParticipants: eventClass.maxParticipants }),
        },
      ),
    ),
  );
  if (capacities.some((capacity) => !capacity.ok)) throw new Error();
}

/** Plans (`dryRun`) or performs the assignment of all open start numbers. */
export async function assignOpenNumbers(
  eventId: string,
  dryRun: boolean,
): Promise<number> {
  const response = await adminFetch(
    `${eventUrl(eventId)}/start-numbers/assign-all${dryRun ? '?dryRun=1' : ''}`,
    { method: 'POST' },
  );
  return (await json<{ assigned: unknown[] }>(response)).assigned.length;
}
