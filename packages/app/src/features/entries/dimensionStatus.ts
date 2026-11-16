type Meaning =
  'new' | 'in_progress' | 'missing' | 'done' | 'rejected' | 'not_relevant';

/**
 * Display status of a status dimension. A pending technical inspection happens on site and is
 * not an overdue item, so it reads neutral (A7); the stored meaning stays "missing".
 */
export function dimensionStatus(
  key: string,
  meaning: Meaning,
): Meaning | 'empty' {
  if (key === 'technical_inspection' && meaning === 'missing') return 'new';
  if (key === 'payment' && meaning === 'not_relevant') return 'empty';
  return meaning;
}
