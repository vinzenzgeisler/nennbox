import {
  ChoiceCard,
  ChoiceGroup,
  NumberStepper,
  OnboardingIcon,
} from '@nennbox/ui';
import { icons } from '../icons.js';
import type { StepProps } from './types.js';

/** Follow-up under the vehicle-era cards: the build-year limit for historic vehicles. */
export function CutoffYear({ answers, resolved, patch }: StepProps) {
  if (resolved.vehicleEra === 'modern') return null;
  return (
    <NumberStepper
      label={
        resolved.vehicleEra === 'historic'
          ? 'Historisch bis Baujahr'
          : 'Fahrzeugpass für Baujahre bis'
      }
      hint="Jüngere Fahrzeuge brauchen keinen Fahrzeugpass."
      value={answers.historicCutoffYear ?? resolved.historicCutoffYear}
      min={1930}
      max={2005}
      step={5}
      lessLabel="Früher"
      moreLabel="Später"
      onChange={(historicCutoffYear) => patch({ historicCutoffYear })}
    />
  );
}

/** Follow-up under the payment cards: activate online payments now or later. */
export function StripeTiming({ resolved, patch }: StepProps) {
  if (resolved.paymentMode === 'transfer') return null;
  return (
    <div className="nb-onb-followup">
      <h2 className="nb-onb-followup-title">Online-Zahlung aktivieren</h2>
      <ChoiceGroup columns={2} aria-label="Online-Zahlung aktivieren">
        <ChoiceCard
          value="now"
          checked={resolved.stripeTiming === 'now'}
          onChange={() => patch({ stripeTiming: 'now' })}
          title="Jetzt aktivieren"
          description="Dauert etwa fünf Minuten, danach ist alles startklar."
          illustration={<OnboardingIcon path={icons['stripe-now']} />}
        />
        <ChoiceCard
          value="later"
          checked={resolved.stripeTiming === 'later'}
          onChange={() => patch({ stripeTiming: 'later' })}
          title="Später"
          description="Ihr öffnet zuerst mit Überweisung und schaltet online später frei."
          illustration={<OnboardingIcon path={icons['stripe-later']} />}
        />
      </ChoiceGroup>
    </div>
  );
}
