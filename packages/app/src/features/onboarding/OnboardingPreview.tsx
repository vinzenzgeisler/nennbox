import { useLayoutEffect, useState } from 'react';
import {
  Button,
  LivePreview,
  OnboardingProgress,
  OnboardingShell,
  StepActions,
  Wordmark,
} from '@racepilot/ui';
import {
  canContinue,
  onboardingPhaseOf,
  onboardingPhases,
  onboardingProgress,
  onboardingSteps,
  requiredSteps,
  resolveAnswers,
  suggestEventConfig,
  type OnboardingPhase,
  type OnboardingStepId,
} from '@racepilot/contracts';
import { choiceSteps } from './choices.js';
import { formatTime } from './format.js';
import { EventPagePreview } from './preview/EventPagePreview.js';
import { FormPreview } from './preview/FormPreview.js';
import { BrandStep, type LogoState } from './steps/BrandStep.js';
import { ChoiceStepView, type ChoiceStepId } from './steps/ChoiceStepView.js';
import { CutoffYear, StripeTiming } from './steps/ChoiceExtras.js';
import { ClassesStep } from './steps/ClassesStep.js';
import { ClubStep } from './steps/ClubStep.js';
import { ExpectedStep } from './steps/ExpectedStep.js';
import { SuccessScreen } from './steps/SuccessScreen.js';
import { SummaryStep } from './steps/SummaryStep.js';
import { TermsStep } from './steps/TermsStep.js';
import { sampleTakenSubdomains, type StepProps } from './steps/types.js';
import { WhenStep } from './steps/WhenStep.js';
import { useOnboardingState } from './state.js';
import './onboarding.css';
import './preview/preview.css';

const phaseLabels: Record<OnboardingPhase, string> = {
  account: 'Konto',
  club: 'Verein',
  kind: 'Veranstaltung',
  details: 'Details',
  classes: 'Klassen',
  when: 'Termin',
  done: 'Fertig',
};
type View = 'form' | 'event';
const logoStorageKey = 'nennbox.onboarding-preview.logo.v1';

function savedLogo(): LogoState {
  try {
    const raw = window.localStorage.getItem(logoStorageKey);
    return raw ? (JSON.parse(raw) as LogoState) : null;
  } catch {
    return null;
  }
}
const formSteps: OnboardingStepId[] = [
  'starters',
  'vehicle-era',
  'vehicle-type',
  'numbers',
  'codriver',
  'double-start',
];

/**
 * Clickable prototype of the guided onboarding (#201, phase 1). All data is local;
 * nothing is sent anywhere. Phase 2 replaces `useOnboardingState` and the sample data
 * with the organization, event-setup, form-field, start-number, waitlist and payment APIs.
 */
export function OnboardingPreview() {
  const { state, patch, go, next, back, publish, reset } = useOnboardingState();
  const [logo, setLogo] = useState<LogoState>(savedLogo);
  useLayoutEffect(() => {
    try {
      if (logo)
        window.localStorage.setItem(logoStorageKey, JSON.stringify(logo));
      else window.localStorage.removeItem(logoStorageKey);
    } catch {
      // Private mode or a large image: the logo remains available this session.
    }
  }, [logo]);
  const restart = () => {
    setLogo(null);
    reset();
  };
  const [override, setOverride] = useState<{
    step: OnboardingStepId;
    view: View;
  } | null>(null);
  const { answers, step } = state;
  const resolved = resolveAnswers(answers);
  const proposal = suggestEventConfig(answers);
  const steps = onboardingSteps(answers);
  const progress = onboardingProgress(step, answers);
  const allowed = canContinue(step, answers, sampleTakenSubdomains);
  const view: View =
    override?.step === step
      ? override.view
      : formSteps.includes(step)
        ? 'form'
        : 'event';
  const isSuccess = step === 'success';

  const segments = onboardingPhases.map((phase, index) => {
    const inPhase = steps.filter((id) => onboardingPhaseOf(id) === phase);
    const position = inPhase.indexOf(step);
    const fill =
      index < progress.phaseIndex || step === 'success'
        ? 1
        : index > progress.phaseIndex
          ? 0
          : (position + 0.5) / inPhase.length;
    return { label: phaseLabels[phase], fill };
  });

  const common: StepProps = {
    answers,
    resolved,
    proposal,
    patch,
    next,
    canContinue: allowed,
    eyebrow: `Schritt ${progress.index + 1} von ${progress.total - 1}`,
  };
  const choice = (id: ChoiceStepId, extra?: React.ReactNode) => (
    <ChoiceStepView key={id} id={id} extra={extra} {...common} />
  );
  const body = (() => {
    switch (step) {
      case 'club':
        return <ClubStep {...common} />;
      case 'brand':
        return <BrandStep {...common} logo={logo} setLogo={setLogo} />;
      case 'vehicle-era':
        return choice(step, <CutoffYear {...common} />);
      case 'payment':
        return choice(step, <StripeTiming {...common} />);
      case 'expected':
        return <ExpectedStep {...common} />;
      case 'classes':
        return <ClassesStep {...common} />;
      case 'when':
        return <WhenStep {...common} />;
      case 'terms':
        return <TermsStep {...common} />;
      case 'summary':
        return (
          <SummaryStep {...common} go={go} onDraft={() => publish('draft')} />
        );
      case 'success':
        return (
          <SuccessScreen
            proposal={proposal}
            outcome={state.outcome ?? 'open'}
            onReset={restart}
          />
        );
      default:
        return choice(step);
    }
  })();

  const preview = isSuccess ? undefined : (
    <LivePreview<View>
      label="Live-Vorschau"
      title="Vorschau"
      statusLabel="Live"
      viewsLabel="Ansicht der Vorschau"
      views={[
        { value: 'event', label: 'Veranstaltungsseite' },
        { value: 'form', label: 'Nennformular' },
      ]}
      view={view}
      onViewChange={(next) => setOverride({ step, view: next })}
      address={
        view === 'form'
          ? proposal.registrationUrl.replace('https://', '')
          : `${proposal.organization.subdomain || 'verein'}.nennbox.com/events/${proposal.event.slug}`
      }
    >
      {view === 'form' ? (
        <FormPreview proposal={proposal} logoUrl={logo?.url ?? null} />
      ) : (
        <EventPagePreview proposal={proposal} logoUrl={logo?.url ?? null} />
      )}
    </LivePreview>
  );

  const actions = isSuccess ? undefined : (
    <StepActions
      backLabel="Zurück"
      onBack={step === 'account' ? undefined : back}
      skipLabel="Überspringen"
      onSkip={requiredSteps.includes(step) ? undefined : next}
      continueLabel={step === 'summary' ? 'Nennung öffnen' : 'Weiter'}
      onContinue={step === 'summary' ? () => publish('open') : next}
      continueDisabled={!allowed}
      disabledReason="Bitte erst die Angaben auf dieser Seite vervollständigen."
      hint={
        step === 'summary'
          ? 'Enter ↵ Nennung öffnen'
          : step in choiceSteps
            ? 'Enter ↵ weiter · 1–9 wählen'
            : 'Enter ↵ weiter'
      }
    />
  );

  return (
    <OnboardingShell
      brand={<Wordmark style={{ fontSize: 18 }} />}
      progress={
        <OnboardingProgress
          label="Fortschritt der Einrichtung"
          segments={segments}
          current={progress.phaseIndex}
          position={`Schritt ${Math.min(progress.index + 1, progress.total - 1)} von ${progress.total - 1} · ${phaseLabels[progress.phase]}`}
          completedLabel="erledigt"
        />
      }
      headerEnd={
        <>
          <span>
            {state.savedAt ? (
              <>
                Gespeichert
                <span className="nb-onb-saved-time">
                  {' · '}
                  {formatTime(state.savedAt)}
                </span>
              </>
            ) : (
              'Prototyp'
            )}
          </span>
          {!isSuccess && step !== 'account' && (
            <Button variant="text" size={40} onClick={restart}>
              Neu
            </Button>
          )}
        </>
      }
      preview={preview}
      previewToggleLabel="Vorschau anzeigen"
      previewCloseLabel="Vorschau schließen"
      actions={actions}
    >
      {body}
    </OnboardingShell>
  );
}

export default OnboardingPreview;
