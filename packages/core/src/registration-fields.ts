/**
 * Standard registration fields whose presence the organization or the event decides.
 * Shared by the delivered form and the server-side check, so what the form asks for and
 * what the server accepts cannot drift apart.
 */
import { RegistrationFormConfigPatchSchema } from '@racepilot/contracts';

export type RegistrationFieldState = 'required' | 'optional' | 'hidden';

export const registrationDetailFieldKeys = [
  'dateOfBirth',
  'phone',
  'street',
  'postalCode',
  'city',
  'emergencyContact',
  'bloodGroup',
  'licenseNumber',
  'publicationPreference',
  'displacement',
  'cylinders',
  'transponderNumber',
  'vehiclePassNumber',
  'owner',
  'history',
] as const;
export type RegistrationDetailFieldKey =
  (typeof registrationDetailFieldKeys)[number];
export type RegistrationFieldStates = Record<
  RegistrationDetailFieldKey,
  RegistrationFieldState
>;

type StoredConfig = unknown;

/** A key missing from an older stored configuration means the default: optional. */
export function resolveRegistrationFieldStates(
  organization: StoredConfig,
  event: StoredConfig,
): RegistrationFieldStates {
  const parse = (config: StoredConfig) => {
    const result = RegistrationFormConfigPatchSchema.safeParse(config);
    return result.success ? result.data.fields : undefined;
  };
  const organizationFields = parse(organization);
  const eventFields = parse(event);
  const resolved: RegistrationFieldStates = {
    dateOfBirth: 'required',
    phone: 'optional',
    street: 'optional',
    postalCode: 'optional',
    city: 'optional',
    emergencyContact: 'optional',
    bloodGroup: 'hidden',
    licenseNumber: 'hidden',
    publicationPreference: 'optional',
    displacement: 'optional',
    cylinders: 'optional',
    transponderNumber: 'hidden',
    vehiclePassNumber: 'hidden',
    owner: 'optional',
    history: 'optional',
  };
  for (const key of registrationDetailFieldKeys)
    resolved[key] =
      eventFields?.[key]?.state ??
      organizationFields?.[key]?.state ??
      (key === 'dateOfBirth'
        ? 'required'
        : [
              'bloodGroup',
              'licenseNumber',
              'transponderNumber',
              'vehiclePassNumber',
            ].includes(key)
          ? 'hidden'
          : 'optional');
  return resolved;
}

export interface RegistrationDetailsInput {
  dateOfBirth?: string | null | undefined;
  phone?: string | null | undefined;
  bloodGroup?: string | null | undefined;
  licenseNumber?: string | null | undefined;
  street?: string | null | undefined;
  postalCode?: string | null | undefined;
  city?: string | null | undefined;
  emergencyContactName?: string | null | undefined;
  emergencyContactPhone?: string | null | undefined;
  publicationPreference?: string | null | undefined;
}
export interface VehicleDetailsInput {
  displacementCc?: number | null | undefined;
  cylinders?: number | null | undefined;
  transponderNumber?: string | null | undefined;
  vehiclePassNumber?: string | null | undefined;
  ownerName?: string | null | undefined;
  history?: string | null | undefined;
}

const present = (value: unknown) =>
  value !== null && value !== undefined && value !== '';

function check(
  state: RegistrationFieldState,
  values: unknown[],
  all: boolean,
): boolean {
  const given = values.map(present);
  if (state === 'hidden') return !given.some(Boolean);
  if (state === 'required') return given.every(Boolean);
  // Optional parts that belong together are given together or not at all.
  return all ? given.every(Boolean) || !given.some(Boolean) : true;
}

/** Whether the contact data fits the configured states: hidden stays empty, required is given. */
export function registrationContactMatches(
  input: RegistrationDetailsInput,
  states: RegistrationFieldStates,
): boolean {
  return (
    check(states.dateOfBirth, [input.dateOfBirth], false) &&
    check(states.phone, [input.phone], false) &&
    check(states.bloodGroup, [input.bloodGroup], false) &&
    check(states.licenseNumber, [input.licenseNumber], false) &&
    check(states.street, [input.street], false) &&
    check(states.postalCode, [input.postalCode], false) &&
    check(states.city, [input.city], false) &&
    check(
      states.emergencyContact,
      [input.emergencyContactName, input.emergencyContactPhone],
      true,
    ) &&
    check(states.publicationPreference, [input.publicationPreference], false)
  );
}

export function registrationVehicleDetailsMatch(
  input: VehicleDetailsInput,
  states: RegistrationFieldStates,
): boolean {
  return (
    check(states.displacement, [input.displacementCc], false) &&
    check(states.cylinders, [input.cylinders], false) &&
    check(states.transponderNumber, [input.transponderNumber], false) &&
    check(states.vehiclePassNumber, [input.vehiclePassNumber], false) &&
    check(states.owner, [input.ownerName], false) &&
    check(states.history, [input.history], false)
  );
}
