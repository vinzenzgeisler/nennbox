import type { EntryResponse as Entry } from '@nennbox/contracts';
export function completionStates(entry: Entry) {
  const dimensions = entry.statusProjection?.dimensions ?? [];
  const dimension = (key: string) => {
    const value = dimensions.find((item) => item.key === key);
    if (!value || value.meaning === 'not_relevant')
      return 'not_relevant' as const;
    if (value.meaning === 'done') return 'done' as const;
    return key === 'technical_inspection'
      ? ('wait' as const)
      : ('missing' as const);
  };
  const documents = entry.documentProjection;
  const docs =
    !documents || !documents.requiredCount
      ? ('not_relevant' as const)
      : documents.uploadedRequiredCount >= documents.requiredCount
        ? ('done' as const)
        : ('missing' as const);
  return [
    dimension('payment'),
    docs,
    dimension('technical_inspection'),
    dimension('waiver'),
  ];
}
