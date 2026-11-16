import type { RegistrationModel } from './RegistrationModel.js';
import { fieldState, nullIfEmpty } from './RegistrationDomain.js';

type Config = RegistrationModel['payload']['registrationFormConfig'];
/** A field the event no longer asks for is never sent, even if an older draft still holds a value. */
export const asked = (config: Config, key: keyof Config['fields']) =>
  fieldState(config, key) !== 'hidden';
export const contactPayload = (
  values: RegistrationModel['values'],
  config: Config,
) => ({
  phone: asked(config, 'phone') ? nullIfEmpty(values.phone) : null,
  bloodGroup: asked(config, 'bloodGroup')
    ? nullIfEmpty(values.bloodGroup)
    : null,
  licenseNumber: asked(config, 'licenseNumber')
    ? nullIfEmpty(values.licenseNumber)
    : null,
  street: asked(config, 'street') ? nullIfEmpty(values.street) : null,
  postalCode: asked(config, 'postalCode')
    ? nullIfEmpty(values.postalCode)
    : null,
  city: asked(config, 'city') ? nullIfEmpty(values.city) : null,
  emergencyContactName: asked(config, 'emergencyContact')
    ? nullIfEmpty(values.emergencyContactName)
    : null,
  emergencyContactPhone: asked(config, 'emergencyContact')
    ? nullIfEmpty(values.emergencyContactPhone)
    : null,
  publicationPreference: asked(config, 'publicationPreference')
    ? values.publicationPreference || null
    : null,
});
