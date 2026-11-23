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
import { formatTime } from '../../format.js';
import { remainingTime, sectionBar, sectionLabels } from './sections.js';
import { useOnboardingLogo } from './useOnboardingLogo.js';
import { chosenOption, type ChoiceStepId } from './steps/ChoiceStepView.js';
import { StepBody } from './steps/StepBody.js';
import { sampleTakenSubdomains, type StepProps } from './steps/types.js';
import { useOnboardingState } from './state.js';
import './onboarding.css';
import './onboarding-finish.css';
import './onboarding-form.css';

/**
 * Clickable prototype of the guided onboarding (#201, phase 1). All data is local;
 * nothing is sent anywhere. Phase 2 replaces `useOnboardingState` and the sample data
 * with the organization, event-setup, form-field, start-number, waitlist and payment APIs.
 */
export function OnboardingPreview() {
  const {
    state,
    savedAt,
    storageFailed,
    patch,
    go,
    next: advance,
    skip,
    back,
    pause,
    setWay,
    publish,
    reset,
  } = useOnboardingState();
  const { logo, setLogo, logoStorageFailed } = useOnboardingLogo();
  const sessionOnly = storageFailed || logoStorageFailed;
  const restart = () => {
    setLogo(null);
    reset();
  };
  const { answers, step, skipped } = state;
  // No additional language means only German, unless the member already accepted the suggestion.
  const next = () => {
    if (
      step === 'languages' &&
      answers.languages === null &&
      !skipped.includes('languages')
    )
      patch({ languages: [] });
    advance();
  };
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
  const way = state.startWay ?? 'draft';
  const isSummary = step === 'summary';

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
    next: isSummary ? () => publish(way) : next,
    canContinue: allowed,
    eyebrow,
    accepted,
  };
  const body = (
    <StepBody
      step={step}
      common={common}
      logo={logo}
      setLogo={setLogo}
      way={way}
      onWay={setWay}
      go={go}
      proposal={proposal}
      answers={answers}
      outcome={state.outcome}
      onOpen={() => publish('open')}
      onReset={restart}
    />
  );

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
      onSkip={
        requiredSteps.includes(step)
          ? undefined
          : () => {
              if (step === 'brand') setLogo(null);
              skip();
            }
      }
      continueLabel={
        isSummary
          ? way === 'draft'
            ? 'Entwurf anlegen'
            : 'Nennung öffnen'
          : 'Weiter'
      }
      onContinue={isSummary ? () => publish(way) : next}
      continueDisabled={!allowed}
      disabledReason="Bitte erst die Angaben auf dieser Seite vervollständigen."
      hints={
        isSummary
          ? [`↵ ${way === 'draft' ? 'Entwurf anlegen' : 'Nennung öffnen'}`]
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
          <span
            className="nb-onb-position"
            aria-label="Oberflächensprache: Deutsch"
            title="Das Einrichten ist bisher auf Deutsch verfügbar. Die Sprachen für Teilnehmer wählt ihr separat."
          >
            DE
          </span>
          {sessionOnly ? (
            <span className="nb-onb-position" role="status">
              Nur für diese Sitzung · Speichern auf diesem Gerät nicht möglich
            </span>
          ) : savedAt ? (
            <span className="nb-onb-position nb-onb-hide-narrow">
              {`Gespeichert · ${formatTime(savedAt)}`}
            </span>
          ) : null}
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
        isSuccess || paused || isSummary ? undefined : (
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
      wide={isSummary}
    >
      {paused ? (
        <section className="nb-onb-paused" aria-labelledby="nb-onb-paused">
          <h1 id="nb-onb-paused" className="nb-question-title">
            {sessionOnly
              ? 'Dein Stand bleibt in dieser Sitzung'
              : 'Dein Stand ist gespeichert'}
          </h1>
          <p className="nb-question-lead">
            {sessionOnly
              ? 'Du kannst hier weitermachen, solange diese Seite geöffnet bleibt. Deine Antworten konnten nicht auf diesem Gerät gespeichert werden.'
              : 'Du kannst hier jederzeit weitermachen. Alle Antworten bleiben auf diesem Gerät erhalten.'}
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
