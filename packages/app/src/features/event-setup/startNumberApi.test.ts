import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminFetch } from '../../auth.js';
import { saveStartNumberSetup } from './startNumberApi.js';

vi.mock('../../auth.js', () => ({ adminFetch: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('atomic number and waitlist save', () => {
  it('sends ranges, settings and all capacities in a single PUT without class PATCH requests', async () => {
    vi.mocked(adminFetch).mockResolvedValue(new Response('{}'));
    const settings = { automaticPromotion: true, confirmationHours: 24 };
    await saveStartNumberSetup(
      'event',
      [
        {
          classId: null,
          from: '1',
          to: '50',
          reserved: '7, 9',
          mode: 'automatic',
        },
      ],
      settings,
      [
        { id: 'one', name: 'First', maxParticipants: 10 },
        { id: 'two', name: 'Second', maxParticipants: null },
      ],
    );
    expect(adminFetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(adminFetch).mock.calls[0]!;
    expect(url).toBe('/admin/events/event/start-numbers');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(init!.body as string)).toEqual({
      ranges: [
        { classId: null, from: 1, to: 50, reserved: [7, 9], mode: 'automatic' },
      ],
      settings,
      classCapacities: [
        { classId: 'one', maxParticipants: 10 },
        { classId: 'two', maxParticipants: null },
      ],
    });
  });

  it('reports a failed transaction without issuing further writes', async () => {
    vi.mocked(adminFetch).mockResolvedValue(
      new Response('{}', { status: 422 }),
    );
    await expect(
      saveStartNumberSetup(
        'event',
        [],
        {
          automaticPromotion: false,
          confirmationHours: 48,
        },
        [{ id: 'one', name: 'First', maxParticipants: 10 }],
      ),
    ).rejects.toThrow();
    expect(adminFetch).toHaveBeenCalledTimes(1);
  });
});
