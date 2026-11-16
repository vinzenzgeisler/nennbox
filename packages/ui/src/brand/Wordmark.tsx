import type { CSSProperties, HTMLAttributes } from 'react';
import { Signet } from './Signet.js';

export type BrandVariant =
  'standard' | 'on-green' | 'monochrome-white' | 'monochrome-black';
const palettes: Record<BrandVariant, { background: string; mark: string }> = {
  standard: { background: 'var(--color-ivory)', mark: 'var(--color-green)' },
  'on-green': { background: 'var(--color-green)', mark: 'var(--color-ivory)' },
  'monochrome-white': {
    background: 'var(--color-ink)',
    mark: 'var(--color-white)',
  },
  'monochrome-black': {
    background: 'var(--color-ivory)',
    mark: 'var(--color-ink)',
  },
};

export function Wordmark({
  variant = 'standard',
  className,
  signetSize = '1.7cap',
  tracking = '0.03em',
  ...props
}: {
  variant?: BrandVariant;
  className?: string;
  /** CSS length of the signet; defaults to the brand-book ratio to the cap height. */
  signetSize?: string;
  /** Letter spacing of the word. */
  tracking?: string;
} & Omit<HTMLAttributes<HTMLSpanElement>, 'color'>) {
  const palette = palettes[variant];
  return (
    <span
      className={className}
      aria-label="NENNBOX"
      {...props}
      style={
        {
          display: 'inline-flex',
          fontFamily: 'var(--font-archivo)',
          fontStretch: '118%',
          fontWeight: 800,
          alignItems: 'center',
          gap: '0.35em',
          color: palette.mark,
          backgroundColor: palette.background,
          ...props.style,
        } as CSSProperties
      }
    >
      <Signet
        style={{
          width: signetSize,
          height: signetSize,
          fill: variant === 'on-green' ? 'var(--color-mint)' : 'currentColor',
          flex: 'none',
        }}
      />
      <span
        style={{
          color: variant === 'on-green' ? 'var(--color-ivory)' : palette.mark,
          letterSpacing: tracking,
          lineHeight: 1,
        }}
      >
        NENNBOX
      </span>
    </span>
  );
}
