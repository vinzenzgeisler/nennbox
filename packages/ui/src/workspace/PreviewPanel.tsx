import type { ReactNode } from 'react';
export function PreviewPanel({
  eyebrow,
  number,
  title,
  subtitle,
  imageUrl,
  imageAlt = '',
  labels,
  children,
  footer,
  hints,
  onClose,
  closeLabel,
}: {
  eyebrow?: string;
  number?: string | null;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  imageAlt?: string;
  labels?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Pinned bar below the scroll area, e.g. keyboard instructions. */
  hints?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <section className="nb-preview-panel">
      <div className="nb-preview-bar">
        {eyebrow ? <p className="nb-preview-eyebrow">{eyebrow}</p> : <span />}
        {onClose && (
          <button
            className="nb-preview-close"
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>
      <div className="nb-preview-scroll">
        <header>
          <strong className="nb-preview-number">{number || '—'}</strong>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </header>
        {labels && <div className="nb-preview-labels">{labels}</div>}
        {imageUrl ? (
          <img className="nb-preview-image" src={imageUrl} alt={imageAlt} />
        ) : (
          <div
            className="nb-preview-image nb-preview-image-empty"
            aria-label={imageAlt}
          >
            —
          </div>
        )}
        <div className="nb-preview-body">{children}</div>
        {footer && <footer className="nb-preview-footer">{footer}</footer>}
      </div>
      {hints && <div className="nb-preview-hints">{hints}</div>}
    </section>
  );
}
