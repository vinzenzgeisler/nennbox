import type {
  EventConfigProposal,
  OnboardingStepId,
  ProposedDocument,
  ReasonCode,
  ResolvedAnswers,
} from '@nennbox/contracts';
import { shortReasons } from './short-reasons.js';

export type EmergingFieldInput = {
  id: string;
  name: string;
  tag: string;
  tone: 'required' | 'optional' | 'file';
  reason: string;
};

/**
 * Form fields and documents that follow from the answers so far. A field appears as
 * soon as the screen that decides it has been answered, skipped or passed.
 */
export function formRows(
  proposal: EventConfigProposal,
  resolved: ResolvedAnswers,
  steps: OnboardingStepId[],
  decided: (id: OnboardingStepId) => boolean,
): { fields: EmergingFieldInput[]; documents: EmergingFieldInput[] } {
  const reasonOf = (setting: string): string | undefined => {
    const code: ReasonCode | undefined = proposal.reasons.find(
      (item) => item.setting === setting,
    )?.reason;
    return code ? shortReasons[code] : undefined;
  };
  const state = (key: string) =>
    (proposal.formConfig.fields as Record<string, { state?: string }>)[key]
      ?.state;
  const tag = (value: string | undefined) =>
    value === 'required' ? 'Pflicht' : 'Freiwillig';
  const tone = (value: string | undefined) =>
    value === 'required' ? ('required' as const) : ('optional' as const);

  const fields: EmergingFieldInput[] = [
    {
      id: 'name',
      name: 'Name und Anschrift',
      tag: 'Pflicht',
      tone: 'required',
      reason: 'Immer dabei',
    },
    {
      id: 'email',
      name: 'E-Mail-Adresse',
      tag: 'Pflicht',
      tone: 'required',
      reason: 'Für Bestätigung und Rückfragen',
    },
    {
      id: 'class',
      name: 'Klasse',
      tag: 'Pflicht',
      tone: 'required',
      reason: 'Zur Auswahl stehen eure Klassen',
    },
  ];
  if (decided('kind')) {
    fields.push({
      id: 'vehicle',
      name: state('displacement') ? 'Fahrzeug und Hubraum' : 'Fahrzeug',
      tag: 'Pflicht',
      tone: 'required',
      reason: reasonOf('displacement') ?? 'Marke und Modell',
    });
    if (state('transponderNumber'))
      fields.push({
        id: 'transponder',
        name: 'Transpondernummer',
        tag: 'Freiwillig',
        tone: 'optional',
        reason: reasonOf('transponderNumber') ?? '',
      });
    if (state('emergencyContact'))
      fields.push({
        id: 'emergency',
        name: 'Notfallkontakt',
        tag: 'Pflicht',
        tone: 'required',
        reason: reasonOf('emergencyContact') ?? '',
      });
  }
  if (decided('starters') && state('licenseNumber') !== 'hidden')
    fields.push({
      id: 'license',
      name: 'Lizenznummer',
      tag: tag(state('licenseNumber')),
      tone: tone(state('licenseNumber')),
      reason: reasonOf('licenseNumber') ?? '',
    });
  if (decided('vehicle-era')) {
    if (state('year'))
      fields.push({
        id: 'year',
        name: 'Baujahr',
        tag: 'Pflicht',
        tone: 'required',
        reason: `Historisch bis Baujahr ${resolved.historicCutoffYear}`,
      });
    if (state('vehiclePassNumber'))
      fields.push({
        id: 'pass-number',
        name: 'Fahrzeugpass-Nummer',
        tag: tag(state('vehiclePassNumber')),
        tone: tone(state('vehiclePassNumber')),
        reason: reasonOf('vehiclePassNumber') ?? '',
      });
  }
  if (decided('numbers') && state('requestedStartNumber') === 'optional')
    fields.push({
      id: 'wish',
      name: 'Wunschnummer',
      tag: 'Freiwillig',
      tone: 'optional',
      reason: reasonOf('startNumbers') ?? '',
    });
  if (decided('codriver') && proposal.formConfig.features?.passenger)
    fields.push({
      id: 'codriver',
      name: 'Beifahrer',
      tag: 'Pflicht',
      tone: 'required',
      reason: reasonOf('coDriver') ?? '',
    });

  const documentGate: Record<ProposedDocument['key'], OnboardingStepId> = {
    'vehicle-registration': 'kind',
    license: 'starters',
    'club-membership': 'starters',
    'vehicle-pass': steps.includes('vehicle-era') ? 'vehicle-era' : 'kind',
  };
  const documentSetting: Record<ProposedDocument['key'], string> = {
    'vehicle-registration': '',
    license: 'licenseNumber',
    'club-membership': 'licenseNumber',
    'vehicle-pass': 'vehiclePassNumber',
  };
  const documents = proposal.documents
    .filter((item) => decided(documentGate[item.key]))
    .map((item) => ({
      id: `doc-${item.key}`,
      name: item.name,
      tag: item.required ? 'Datei' : 'Freiwillig',
      tone: item.required ? ('file' as const) : ('optional' as const),
      reason:
        item.hint ?? reasonOf(documentSetting[item.key]) ?? 'Wird hochgeladen',
    }));

  return { fields, documents };
}
