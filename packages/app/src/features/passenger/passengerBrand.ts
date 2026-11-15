import type { CSSProperties } from 'react';
import {
  defaultRegistrationFormConfig,
  deriveAccessibleBrandColors,
} from '@racepilot/contracts';

const brand = deriveAccessibleBrandColors(
  defaultRegistrationFormConfig.branding.primaryColor,
  defaultRegistrationFormConfig.branding.accentColor,
);

// The link is not tied to one event's branding yet, so it carries the default form branding.
export const passengerBrandStyle: CSSProperties &
  Record<`--brand-${string}`, string> = {
  '--brand-primary': brand.primarySurface,
  '--brand-accent': brand.accentSurface,
  '--brand-primary-text': brand.primaryForeground,
  '--brand-accent-text': brand.accentForeground,
  '--brand-link': brand.linkColor,
  '--brand-radius': '0',
};
