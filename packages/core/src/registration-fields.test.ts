import { describe, expect, it } from 'vitest';
import {
  registrationBirthDateMatches,
  registrationContactMatches,
  registrationVehicleDetailsMatch,
  resolveRegistrationFieldStates,
  type RegistrationFieldStates,
} from './registration-fields.js';

const states = (patch: Partial<RegistrationFieldStates> = {}) => ({
  ...resolveRegistrationFieldStates(null, null),
  ...patch,
});

describe('registration field states', () => {
  it('lets an event override single fields and falls back to the organization, then optional', () => {
    const resolved = resolveRegistrationFieldStates(
      { fields: { phone: { state: 'required' }, city: { state: 'hidden' } } },
      { fields: { city: { state: 'optional' }, owner: { state: 'required' } } },
    );
    expect(resolved).toMatchObject({
      phone: 'required',
      city: 'optional',
      owner: 'required',
      street: 'optional',
      publicationPreference: 'optional',
    });
  });

  it('keeps old configurations that do not know the newer fields usable', () => {
    expect(
      resolveRegistrationFieldStates(
        { fields: { requestedStartNumber: { state: 'hidden' } } },
        { fields: 'broken' },
      ).publicationPreference,
    ).toBe('optional');
  });

  it('requires given, rejects hidden and treats the emergency contact as one unit', () => {
    expect(registrationContactMatches({}, states())).toBe(true);
    expect(registrationContactMatches({}, states({ phone: 'required' }))).toBe(
      false,
    );
    expect(
      registrationContactMatches({ phone: '' }, states({ phone: 'required' })),
    ).toBe(false);
    expect(
      registrationContactMatches(
        { phone: '+49 1234' },
        states({ phone: 'hidden' }),
      ),
    ).toBe(false);
    expect(
      registrationContactMatches({ emergencyContactName: 'Anna' }, states()),
    ).toBe(false);
    expect(
      registrationContactMatches(
        { emergencyContactPhone: '+49 1234' },
        states(),
      ),
    ).toBe(false);
    expect(
      registrationContactMatches(
        { emergencyContactName: 'Anna', emergencyContactPhone: '+49 1234' },
        states({ emergencyContact: 'required' }),
      ),
    ).toBe(true);
    expect(
      registrationContactMatches(
        { emergencyContactName: 'Anna' },
        states({ emergencyContact: 'required' }),
      ),
    ).toBe(false);
  });

  it('applies the same rules to the vehicle details', () => {
    expect(
      registrationVehicleDetailsMatch(
        { displacementCc: 249 },
        states({ displacement: 'hidden' }),
      ),
    ).toBe(false);
    expect(
      registrationVehicleDetailsMatch({}, states({ cylinders: 'required' })),
    ).toBe(false);
    expect(
      registrationVehicleDetailsMatch(
        { cylinders: 2, ownerName: 'Anna', history: 'x' },
        states({
          cylinders: 'required',
          owner: 'required',
          history: 'required',
        }),
      ),
    ).toBe(true);
  });

  it('keeps the newer standard fields hidden and the birth date required until configured', () => {
    expect(resolveRegistrationFieldStates(null, null)).toMatchObject({
      dateOfBirth: 'required',
      bloodGroup: 'hidden',
      licenseNumber: 'hidden',
      transponderNumber: 'hidden',
      vehiclePassNumber: 'hidden',
      phone: 'optional',
    });
    expect(
      resolveRegistrationFieldStates(
        { fields: { bloodGroup: { state: 'required' } } },
        { fields: { bloodGroup: { state: 'optional' } } },
      ).bloodGroup,
    ).toBe('optional');
  });

  it('checks blood group, licence, transponder and vehicle pass against their state', () => {
    expect(
      registrationContactMatches({}, states({ bloodGroup: 'required' })),
    ).toBe(false);
    expect(
      registrationContactMatches(
        { bloodGroup: '0-', licenseNumber: 'L-1' },
        states({ bloodGroup: 'required', licenseNumber: 'required' }),
      ),
    ).toBe(true);
    expect(registrationContactMatches({ bloodGroup: 'A+' }, states())).toBe(
      false,
    );
    expect(registrationContactMatches({ licenseNumber: 'L-1' }, states())).toBe(
      false,
    );
    expect(
      registrationVehicleDetailsMatch(
        { transponderNumber: 'T-9' },
        states({ transponderNumber: 'optional' }),
      ),
    ).toBe(true);
    expect(
      registrationVehicleDetailsMatch({ transponderNumber: 'T-9' }, states()),
    ).toBe(false);
    expect(
      registrationVehicleDetailsMatch(
        {},
        states({ vehiclePassNumber: 'required' }),
      ),
    ).toBe(false);
  });

  it('applies the field state to the date of birth', () => {
    expect(registrationBirthDateMatches(undefined, states())).toBe(false);
    expect(registrationBirthDateMatches('1990-01-01', states())).toBe(true);
    expect(
      registrationBirthDateMatches(null, states({ dateOfBirth: 'optional' })),
    ).toBe(true);
    expect(
      registrationBirthDateMatches(
        '1990-01-01',
        states({ dateOfBirth: 'hidden' }),
      ),
    ).toBe(false);
  });
});
