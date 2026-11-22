import { useLayoutEffect, useState } from 'react';
import {
  AppButton,
  EmergingList,
  OnboardingSections,
  OnboardingShell,
  Signet,
  StepActions,
} from '@nennbox/ui';
import {
  canContinue,
  onboardingPhaseOf,
  onboardingProgress,
  onboardingSteps,
  requiredSteps,
  resolveAnswers,
  suggestEventConfig,
} from '@nennbox/contracts';
import { choiceSteps } from './choices.js';
import { buildEmerging, emergingOpenLabel } from './emerging.js';
import { formatTime } from './format.js';
import { remainingTime, sectionBar, sectionLabels } from './sections.js';
import { BrandStep, type LogoState } from './steps/BrandStep.js';
import {
  ChoiceStepView,
  chosenOption,
  type ChoiceStepId,
} from './steps/ChoiceStepView.js';
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

const logoStorageKey = 'nennbox.onboarding-preview.logo.v1';

function savedLogo(): LogoState {
  try {
    const raw = window.localStorage.getItem(logoStorageKey);
    return raw ? (JSON.parse(raw) as LogoState) : null;
  } catch {
    return null;
  }
}

/**
 * Clickable prototype of the guided onboarding (#201, phase 1). All data is local;
 * nothing is sent anywhere. Phase 2 replaces `useOnboardingState` and the sample data
 * with the organization, event-setup, form-field, start-number, waitlist and payment APIs.
 */
export function OnboardingPreview() {
  const { state, patch, go, next, skip, back, pause, publish, reset } =
    useOnboardingState();
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
  const { answers, step, skipped } = state;
  const resolved = resolveAnswers(answers);
  const proposal = suggestEventConfig(answers);
  const steps = onboardingSteps(answers);
  const progress = onboardingProgress(step, answers);
  const isChoice = step in choiceSteps;
  const accepted = skipped.includes(step);
  const chosen =
    !isChoice ||
    chosenOption(step as ChoiceStepId, { answers, resolved, accepted }) !==
      null;
  const allowed = canContinue(step, answers, sampleTakenSubdomains) && chosen;
  const isSuccess = step === 'success';

  const bar = sectionBar(step, answers);
  const activeBar = bar.find((section) => section.state === 'active');
  const here =
    activeBar?.screens.findIndex((screen) => screen.state === 'active') ?? 0;
  const eyebrow = activeBar
    ? [
        `Abschnitt ${bar.indexOf(activeBar) + 1} · ${activeBar.label}`,
        activeBar.screens.length > 1
          ? `${here + 1} von ${activeBar.screens.length}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : sectionLabels[onboardingPhaseOf(step)];

  const common: StepProps = {
    answers,
    resolved,
    proposal,
    patch,
    next,
    canContinue: allowed,
    eyebrow,
    accepted,
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

  const emerging = buildEmerging({
    answers,
    resolved,
    proposal,
    steps,
    current: step,
    skipped,
  });

  const actions = isSuccess ? undefined : (
    <StepActions
      backLabel="Zurück"
      onBack={step === 'account' ? undefined : back}
      skipLabel="Überspringen"
      skipHint="Wir nehmen den Vorschlag"
      onSkip={requiredSteps.includes(step) ? undefined : skip}
      continueLabel={step === 'summary' ? 'Nennung öffnen' : 'Weiter'}
      onContinue={step === 'summary' ? () => publish('open') : next}
      continueDisabled={!allowed}
      disabledReason="Bitte erst die Angaben auf dieser Seite vervollständigen."
      hints={
        step === 'summary'
          ? ['↵ Nennung öffnen']
          : isChoice
            ? chosen
              ? ['↵ weiter', '1–9 wählen']
              : ['1–9 wählen']
            : ['↵ weiter']
      }
    />
  );

  const paused = state.paused;
  return (
    <OnboardingShell
      brand={
        <span className="nb-app-brand">
          <span className="nb-app-brand-icon">
            <Signet />
          </span>
          <strong>NENNBOX</strong>
        </span>
      }
      title="Einrichten"
      position={
        isSuccess ? undefined : (
          <>
            <span className="nb-onb-hide-narrow">Schirm </span>
            {`${progress.index + 1} von ${progress.total - 1}`}
          </>
        )
      }
      progress={isSuccess ? 1 : progress.ratio}
      progressLabel="Fortschritt der Einrichtung"
      headerEnd={
        <>
          {state.savedAt && (
            <span className="nb-onb-position nb-onb-hide-narrow">
              {`Gespeichert · ${formatTime(state.savedAt)}`}
            </span>
          )}
          {!isSuccess && step !== 'account' && (
            <AppButton
              tone="ghost"
              className="nb-onb-hide-narrow"
              onClick={restart}
            >
              Neu
            </AppButton>
          )}
          {!isSuccess && (
            <AppButton tone="ghost" onClick={() => pause(!paused)}>
              {paused ? 'Weitermachen' : 'Später fortsetzen'}
            </AppButton>
          )}
        </>
      }
      sections={
        isSuccess || paused ? undefined : (
          <OnboardingSections
            label="Abschnitte der Einrichtung"
            doneLabel="erledigt"
            sections={bar.map((section) => ({
              id: section.id,
              label: section.label,
              state: section.state,
              screens: section.screens,
            }))}
            onSelect={(id) => {
              const target = bar.find(
                (section) => section.id === id,
              )?.firstStep;
              if (target) go(target);
            }}
            note={{
              title: remainingTime(step, answers),
              text: 'Du kannst jederzeit aufhören. Angefangenes bleibt gespeichert.',
            }}
          />
        )
      }
      emerging={
        isSuccess || paused ? undefined : (
          <EmergingList
            title="Das entsteht"
            openLabel={emergingOpenLabel}
            groups={emerging.groups}
            footnote="Alles hier lässt sich nach dem Einrichten ändern, auch wenn die Nennung schon offen ist."
            closeLabel="Schließen"
          />
        )
      }
      emergingBar={{
        title: 'Das entsteht',
        summary: `${emerging.known} von ${emerging.total} Angaben`,
        open: 'Anzeigen',
        close: 'Schließen',
      }}
      actions={paused ? undefined : actions}
    >
      {paused ? (
        <section className="nb-onb-paused" aria-labelledby="nb-onb-paused">
          <h1 id="nb-onb-paused" className="nb-question-title">
            Dein Stand ist gespeichert
          </h1>
          <p className="nb-question-lead">
            Du kannst hier jederzeit weitermachen. Alle Antworten bleiben auf
            diesem Gerät erhalten.
          </p>
          <AppButton tone="primary" onClick={() => pause(false)}>
            Weitermachen
          </AppButton>
        </section>
      ) : (
        body
      )}
    </OnboardingShell>
  );
}

export default OnboardingPreview;
