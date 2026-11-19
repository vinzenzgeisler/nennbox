import {
  ChoiceCard,
  ChoiceGroup,
  OnboardingSketch,
  Slider,
  Stack,
} from '@racepilot/ui';
import type { StepProps } from './types.js';

/** Follow-up under the vehicle-era cards: the build-year limit for historic vehicles. */
export function CutoffYear({ answers, resolved, patch }: StepProps) {
  if (resolved.vehicleEra === 'modern') return null;
  return (
    <div className="nb-onb-followup">
      <Slider
        label={
          resolved.vehicleEra === 'historic'
            ? 'Historisch bis Baujahr'
            : 'Fahrzeugpass für Baujahre bis'
        }
        value={answers.historicCutoffYear ?? resolved.historicCutoffYear}
        min={1930}
        max={2005}
        onChange={(historicCutoffYear) => patch({ historicCutoffYear })}
        valueText={`Baujahr ${resolved.historicCutoffYear}`}
        minLabel="1930"
        maxLabel="2005"
      />
    </div>
  );
}

/** Follow-up under the payment cards: activate online payments now or later. */
export function StripeTiming({ resolved, patch }: StepProps) {
  if (resolved.paymentMode === 'transfer') return null;
  return (
    <Stack gap={4} className="nb-onb-followup">
      <h2 className="nb-onb-followup-title">Online-Zahlung aktivieren</h2>
      <ChoiceGroup
        layout="rows"
        columns={2}
        aria-label="Online-Zahlung aktivieren"
      >
        <ChoiceCard
          value="now"
          checked={resolved.stripeTiming === 'now'}
          onChange={() => patch({ stripeTiming: 'now' })}
          title="Jetzt aktivieren"
          description="Dauert etwa fünf Minuten, danach ist alles startklar."
          illustration={<OnboardingSketch name="stripe-now" />}
        />
        <ChoiceCard
          value="later"
          checked={resolved.stripeTiming === 'later'}
          onChange={() => patch({ stripeTiming: 'later' })}
          title="Später"
          description="Ihr öffnet zuerst mit Überweisung und schaltet online später frei."
          illustration={<OnboardingSketch name="stripe-later" />}
        />
      </ChoiceGroup>
    </Stack>
  );
}
