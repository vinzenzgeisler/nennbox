import { describe, expect, it, vi } from 'vitest';
import { readEnv } from './env.mjs';

describe('readEnv', () => {
  it('prefers the new name and warns once when falling back', async () => {
    const warn = vi.fn();
    const env = { NENNBOX_TEST: 'new', RACEPILOT_TEST: 'old' };
    expect(readEnv('NENNBOX_TEST', 'RACEPILOT_TEST', env, { warn })).toBe(
      'new',
    );
    delete env.NENNBOX_TEST;
    expect(readEnv('NENNBOX_TEST', 'RACEPILOT_TEST', env, { warn })).toBe(
      'old',
    );
    expect(readEnv('NENNBOX_TEST', 'RACEPILOT_TEST', env, { warn })).toBe(
      'old',
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
