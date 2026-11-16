import { describe, expect, it } from 'vitest';
import { dimensionStatus } from './dimensionStatus.js';

describe('dimensionStatus', () => {
  it('shows a pending technical inspection neutral, other missing items stay urgent', () => {
    expect(dimensionStatus('technical_inspection', 'missing')).toBe('new');
    expect(dimensionStatus('waiver', 'missing')).toBe('missing');
    expect(dimensionStatus('payment', 'missing')).toBe('missing');
  });
  it('keeps done and in-progress inspections and empties irrelevant payments', () => {
    expect(dimensionStatus('technical_inspection', 'done')).toBe('done');
    expect(dimensionStatus('technical_inspection', 'in_progress')).toBe(
      'in_progress',
    );
    expect(dimensionStatus('payment', 'not_relevant')).toBe('empty');
  });
});
