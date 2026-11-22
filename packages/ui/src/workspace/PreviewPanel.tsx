import { AppThumb } from '../app-primitives/AppPrimitives.js';
import type { ReactNode } from 'react';

/** Embedded entry preview: image leads, keyboard help stays pinned. */
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
  recent,
  hints,
  onClose,
  closeLabel,
  onOpen,
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
  recent?: ReactNode;
  hints?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  onOpen?: () => void;
}) {
  return (
    <section className="nb-preview-panel">
      <div className="nb-preview-bar">
        <p className="nb-preview-eyebrow">{eyebrow ?? 'Vorschau'}</p>
        <div className="nb-preview-bar-actions">
          {onOpen && (
            <button
              className="nb-preview-open"
              type="button"
              aria-label="Nennung öffnen"
              onClick={onOpen}
            >
              ↗
            </button>
          )}
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
      </div>
      <div className="nb-preview-scroll">
        <div className="nb-preview-media">
          {imageUrl ? (
            <img className="nb-preview-image" src={imageUrl} alt={imageAlt} />
          ) : (
            <AppThumb className="nb-preview-image nb-preview-image-empty" />
          )}
          {imageUrl && (
            <span className="nb-preview-image-count">1 von 1 Bild</span>
          )}
        </div>
        <header>
          <h2>{title}</h2>
          {subtitle && (
            <p>
              {number ? `Nr. ${number} · ` : ''}
              {subtitle}
            </p>
          )}
        </header>
        {labels && <div className="nb-preview-labels">{labels}</div>}
        <div className="nb-preview-body">{children}</div>
        {footer && <footer className="nb-preview-footer">{footer}</footer>}
        {recent}
      </div>
      {hints && <div className="nb-preview-hints">{hints}</div>}
    </section>
  );
}
