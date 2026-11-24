import type { EventClassInput } from './events.js';

export function validateClass(
  input: Partial<EventClassInput>,
  partial = false,
): void {
  if (
    (!partial || 'name' in input) &&
    (!input.name?.trim() || input.name.length > 120)
  )
    throw new Error('Invalid class name');
  if (
    (!partial || 'code' in input) &&
    (!input.code || input.code.length > 24 || !/^[A-Z0-9-]+$/.test(input.code))
  )
    throw new Error('Invalid class code');
  if (
    input.vehicleType !== undefined &&
    !['car', 'motorcycle', 'kart', 'other'].includes(input.vehicleType)
  )
    throw new Error('Invalid vehicle type');
  if (
    input.sortOrder !== undefined &&
    (!Number.isInteger(input.sortOrder) || input.sortOrder < 0)
  )
    throw new Error('Invalid sort order');
  if (
    input.passengerMode !== undefined &&
    !['none', 'optional', 'required'].includes(input.passengerMode)
  )
    throw new Error('Invalid passenger mode');
  if (
    input.allowsMultipleStarts !== undefined &&
    typeof input.allowsMultipleStarts !== 'boolean'
  )
    throw new Error('Invalid multiple start permission');
  for (const key of [
    'minDisplacementCc',
    'maxDisplacementCc',
    'minYear',
    'maxYear',
  ] as const) {
    const value = input[key];
    if (
      value != null &&
      (!Number.isInteger(value) ||
        value < (key.endsWith('Year') ? 1 : 0) ||
        value > 2147483647)
    )
      throw new Error('Invalid class plausibility limit');
  }
  if (
    (input.minDisplacementCc != null &&
      input.maxDisplacementCc != null &&
      input.minDisplacementCc > input.maxDisplacementCc) ||
    (input.minYear != null &&
      input.maxYear != null &&
      input.minYear > input.maxYear)
  )
    throw new Error('Invalid class plausibility bounds');
  if (
    input.maxParticipants !== undefined &&
    input.maxParticipants !== null &&
    (!Number.isInteger(input.maxParticipants) || input.maxParticipants < 1)
  )
    throw new Error('Invalid participant limit');
}
