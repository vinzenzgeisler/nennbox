import type { ReactNode } from 'react';
/** Picture next to its facts (vehicle photo and data); `below` spans the full width, e.g. an edit form. */
export function MediaDetail({
  imageUrl,
  imageAlt,
  caption,
  emptyLabel,
  children,
  below,
}: {
  imageUrl?: string | null;
  imageAlt: string;
  caption: string;
  /** Accessible name and caption shown when there is no picture. */
  emptyLabel: string;
  children?: ReactNode;
  below?: ReactNode;
}) {
  return (
    <div className="nb-media-detail">
      <figure>
        {imageUrl ? (
          <img src={imageUrl} alt={imageAlt} />
        ) : (
          <div
            className="nb-media-detail-empty"
            role="img"
            aria-label={emptyLabel}
          >
            <svg
              viewBox="0 0 120 70"
              width="132"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="26" cy="50" r="14" />
              <circle cx="94" cy="50" r="14" />
              <path d="M26 50l20-22h26l22 22M46 28l8-10h22l-4 10M40 40h30" />
            </svg>
          </div>
        )}
        <figcaption>{imageUrl ? caption : emptyLabel}</figcaption>
      </figure>
      {children}
      {below && <div className="nb-media-detail-below">{below}</div>}
    </div>
  );
}
