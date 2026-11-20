import type { ReactElement } from 'react';
import {
  Circuit,
  Hillclimb,
  Kart,
  Other,
  Rally,
  Regularity,
  Slalom,
} from './kinds.js';
import {
  AccountEmail,
  AccountGoogle,
  AccountPasskey,
  StartersClub,
  StartersGuests,
  StartersLicensed,
} from './people.js';
import { PayBoth, PayOnline, PayTransfer } from './payments.js';
import {
  BrandLogo,
  CoDriver,
  DoubleStart,
  No,
  NumbersAssigned,
  NumbersAutomatic,
  NumbersRequested,
  StripeLater,
  StripeNow,
  Waitlist,
  Yes,
} from './rules.js';
import {
  EraHistoric,
  EraMixed,
  EraModern,
  TypeBoth,
  TypeCar,
  TypeMotorcycle,
} from './vehicles.js';

const sketches = {
  hillclimb: Hillclimb,
  rally: Rally,
  slalom: Slalom,
  regularity: Regularity,
  kart: Kart,
  circuit: Circuit,
  other: Other,
  google: AccountGoogle,
  passkey: AccountPasskey,
  'email-code': AccountEmail,
  licensed: StartersLicensed,
  clubsport: StartersClub,
  guests: StartersGuests,
  historic: EraHistoric,
  modern: EraModern,
  mixed: EraMixed,
  car: TypeCar,
  motorcycle: TypeMotorcycle,
  both: TypeBoth,
  requested: NumbersRequested,
  assigned: NumbersAssigned,
  automatic: NumbersAutomatic,
  waitlist: Waitlist,
  codriver: CoDriver,
  'double-start': DoubleStart,
  yes: Yes,
  no: No,
  'brand-logo': BrandLogo,
  'stripe-now': StripeNow,
  'stripe-later': StripeLater,
  online: PayOnline,
  transfer: PayTransfer,
  'online-and-transfer': PayBoth,
} satisfies Record<string, () => ReactElement>;

export type SketchName = keyof typeof sketches;
export const sketchNames = Object.keys(sketches) as SketchName[];

/** Line sketch for onboarding choices; each name maps to one hand-built SVG. */
export function OnboardingSketch({ name }: { name: SketchName }) {
  const Component = sketches[name];
  return <Component />;
}
