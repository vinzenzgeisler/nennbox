import { useEffect, useState } from 'react';
import {
  defaultRegistrationFormConfig,
  mergeRegistrationFormConfig,
  RegistrationFormConfigSchema,
  RegistrationFormConfigPatchSchema,
  type RegistrationFormConfig,
  type RegistrationFormConfigPatch,
} from '@nennbox/contracts';
import { adminFetch } from '../../auth.js';

/** Only edited areas become overrides. Existing full copies remain explicit until reset. */
export function changedOverrides(
  patch: RegistrationFormConfigPatch,
  before: RegistrationFormConfig,
  after: RegistrationFormConfig,
): RegistrationFormConfigPatch {
  const next = { ...patch };
  for (const key of Object.keys(after) as (keyof RegistrationFormConfig)[]) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    if (key === 'fields') {
      next.fields = { ...patch.fields };
      for (const field of Object.keys(
        after.fields,
      ) as (keyof typeof after.fields)[])
        if (before.fields[field].state !== after.fields[field].state)
          next.fields[field] = after.fields[field];
    } else Object.assign(next, { [key]: after[key] });
  }
  return next;
}

export function useRegistrationConfig(eventId: string) {
  const [organizationConfig, setOrganizationConfig] =
    useState<RegistrationFormConfig>(defaultRegistrationFormConfig);
  const [overrides, setOverrides] = useState<RegistrationFormConfigPatch>({});
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; text: string } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    const load = async () => {
      const org = await adminFetch(
        '/admin/organization/registration-form-config',
        {
          credentials: 'same-origin',
          cache: 'no-store',
        },
      );
      if (!org.ok)
        throw new Error(
          'Organisations-Einstellungen konnten nicht geladen werden.',
        );
      const organization = RegistrationFormConfigSchema.parse(
        (await org.json()).config,
      );
      let patch: RegistrationFormConfigPatch = {};
      if (eventId) {
        const event = await adminFetch(
          `/admin/events/${encodeURIComponent(eventId)}/registration-form-config`,
          { credentials: 'same-origin', cache: 'no-store' },
        );
        if (event.status !== 404) {
          if (!event.ok)
            throw new Error(
              'Veranstaltungs-Einstellungen konnten nicht geladen werden.',
            );
          // Never infer inheritance from equality: legacy full copies may contain intentional choices.
          patch = RegistrationFormConfigPatchSchema.parse(
            (await event.json()).config,
          );
        }
      }
      if (!active) return;
      setOrganizationConfig(organization);
      setOverrides(patch);
      setLoadedId(eventId);
    };
    void load().catch((cause: unknown) => {
      if (active)
        setFailure({
          id: eventId,
          text:
            cause instanceof Error
              ? cause.message
              : 'Einstellungen konnten nicht geladen werden.',
        });
    });
    return () => {
      active = false;
    };
  }, [eventId]);
  return {
    organizationConfig,
    setOrganizationConfig,
    overrides,
    setOverrides,
    config: mergeRegistrationFormConfig(organizationConfig, overrides),
    loaded: loadedId === eventId,
    error: failure?.id === eventId ? failure.text : '',
  };
}
