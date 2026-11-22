import type { ReactNode } from 'react';
import type {
  EventConfigProposal,
  OnboardingAnswers,
  OnboardingStepId,
} from '@nennbox/contracts';
import type { Outcome } from '../state.js';
import { BrandStep, type LogoState } from './BrandStep.js';
import { ChoiceStepView, type ChoiceStepId } from './ChoiceStepView.js';
import { CutoffYear, StripeTiming } from './ChoiceExtras.js';
import { ClassesStep } from './ClassesStep.js';
import { ClubStep } from './ClubStep.js';
import { ExpectedStep } from './ExpectedStep.js';
import { FormStep } from './FormStep.js';
import { LanguagesStep } from './LanguagesStep.js';
import { SuccessScreen } from './SuccessScreen.js';
import { SummaryPreview } from './SummaryPreview.js';
import { SummaryStep } from './SummaryStep.js';
import { TermsStep } from './TermsStep.js';
import type { StepProps } from './types.js';
import { WhenStep } from './WhenStep.js';

/** The screen for the current step; the frame around it lives in OnboardingPreview. */
export function StepBody({
  step,
  common,
  logo,
  setLogo,
  way,
  onWay,
  go,
  proposal,
  answers,
  outcome,
  onOpen,
  onReset,
}: {
  step: OnboardingStepId;
  common: StepProps;
  logo: LogoState;
  setLogo: (logo: LogoState) => void;
  way: Outcome;
  onWay: (way: Outcome) => void;
  go: (step: OnboardingStepId) => void;
  proposal: EventConfigProposal;
  answers: OnboardingAnswers;
  outcome: Outcome | null;
  onOpen: () => void;
  onReset: () => void;
}) {
  const choice = (id: ChoiceStepId, extra?: ReactNode) => (
    <ChoiceStepView key={id} id={id} extra={extra} {...common} />
  );
  switch (step) {
    case 'club':
      return <ClubStep {...common} />;
    case 'brand':
      return <BrandStep {...common} logo={logo} setLogo={setLogo} />;
    case 'vehicle-era':
      return choice(step, <CutoffYear {...common} />);
    case 'payment':
      return choice(step, <StripeTiming {...common} />);
    case 'languages':
      return <LanguagesStep {...common} />;
    case 'form':
      return <FormStep {...common} />;
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
        <div className="nb-onb-summary-layout">
          <SummaryStep {...common} go={go} way={way} onWay={onWay} />
          <SummaryPreview proposal={proposal} logoUrl={logo?.url ?? null} />
        </div>
      );
    case 'success':
      return (
        <SuccessScreen
          proposal={proposal}
          answers={answers}
          outcome={outcome ?? 'draft'}
          go={go}
          onOpen={onOpen}
          onReset={onReset}
        />
      );
    default:
      return choice(step);
  }
}
